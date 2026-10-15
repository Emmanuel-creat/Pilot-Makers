/**
 * Comptes, sessions et sécurité d'accès (module A).
 */

import { ssoEnforcedFor } from "./sso";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Database, Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { deviceName } from "@/lib/device";
import { badRequest, conflict, forbidden, HttpError, tooMany, unauthorized } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/security";
import { computeEntitlements, createInitialSubscription } from "./billing";
import type { Ctx, JobFunction, Role } from "./context";
import { audit } from "./context";
import { appUrl, sendMail } from "./mail";
import { createLoginChallenge } from "./two-factor";

export const TERMS_VERSION = "2026-10";
export const SESSION_DAYS = 30;
const HOUR = 3_600_000;

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères")
  .max(200, "Mot de passe trop long")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Le mot de passe doit contenir des lettres et des chiffres");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Adresse e-mail invalide");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, "Votre nom est requis").max(120),
  company: z.string().trim().min(1, "Le nom de l'entreprise est requis").max(160),
  trade: z.string().trim().max(80).optional().default(""),
  acceptTerms: z.literal(true, { message: "Vous devez accepter les conditions d'utilisation" }),
});

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash("mot-de-passe-factice", 11));

async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

async function createEmailToken(q: Queryable, userId: string, purpose: "verify" | "reset" | "delete", hours: number) {
  const token = randomToken();
  await q.query("INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1,$2,$3,$4)", [
    userId,
    purpose,
    sha256(token),
    new Date(Date.now() + hours * HOUR),
  ]);
  return token;
}

async function consumeEmailToken(q: Queryable, token: string, purpose: string) {
  const row = await one<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>(
    q,
    "SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash=$1 AND purpose=$2",
    [sha256(token), purpose],
  );
  if (!row || row.used_at || row.expires_at < new Date()) throw badRequest("Lien invalide ou expiré");
  await q.query("UPDATE email_tokens SET used_at=now() WHERE id=$1", [row.id]);
  return row.user_id;
}

export async function register(db: Database, input: unknown, meta: RequestMeta) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, parsed.error.issues);
  const data = parsed.data;
  await hitRate(db, "account.register", meta.ip);
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const passwordHash = await hashPassword(data.password);
  const result = await db.transaction(async (tx) => {
    const exists = await one(tx, "SELECT 1 FROM users WHERE email=$1", [data.email]);
    if (exists) throw conflict("Un compte existe déjà avec cette adresse");
    const user = (await one<{ id: string }>(
      tx,
      `INSERT INTO users (email, password_hash, name, terms_version, terms_accepted_at, is_platform_admin)
       VALUES ($1,$2,$3,$4,now(),$5) RETURNING id`,
      [data.email, passwordHash, data.name, TERMS_VERSION, admins.includes(data.email)],
    ))!;
    const org = (await one<{ id: string }>(
      tx,
      `INSERT INTO organizations (trade_name, email, trade, payment_terms, general_conditions, mail_body_template, reminder_settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        data.company,
        data.email,
        data.trade,
        "Paiement à réception de facture, par virement bancaire.",
        DEFAULT_CONDITIONS,
        DEFAULT_MAIL_BODY,
        JSON.stringify(DEFAULT_REMINDERS),
      ],
    ))!;
    await tx.query("INSERT INTO memberships (user_id, org_id, role) VALUES ($1,$2,'owner')", [user.id, org.id]);
    await createInitialSubscription(tx, org.id);
    const token = await createEmailToken(tx, user.id, "verify", 48);
    await sendMail(tx, {
      orgId: org.id,
      kind: "verify_email",
      to: data.email,
      subject: "Confirmez votre adresse e-mail",
      body: `Bonjour ${data.name},\n\nPour activer votre compte Pilot-Makers, confirmez votre adresse :\n${appUrl("/verifier-email?jeton=" + token)}\n\nCe lien est valable 48 heures.`,
    });
    await audit(tx, { orgId: org.id, userId: user.id, action: "account.register", ip: meta.ip });
    return { userId: user.id, orgId: org.id, verifyToken: token };
  });
  return result;
}

export async function resendVerification(db: Database, userId: string) {
  const user = await one<{ email: string; name: string; email_verified_at: Date | null }>(
    db,
    "SELECT email, name, email_verified_at FROM users WHERE id=$1",
    [userId],
  );
  if (!user || user.email_verified_at) return;
  const token = await createEmailToken(db, userId, "verify", 48);
  await sendMail(db, {
    kind: "verify_email",
    to: user.email,
    subject: "Confirmez votre adresse e-mail",
    body: `Bonjour ${user.name},\n\nConfirmez votre adresse :\n${appUrl("/verifier-email?jeton=" + token)}`,
  });
}

export async function verifyEmail(db: Database, token: string) {
  return db.transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, token, "verify");
    await tx.query("UPDATE users SET email_verified_at = coalesce(email_verified_at, now()), updated_at=now() WHERE id=$1", [userId]);
    await audit(tx, { userId, action: "account.verify_email" });
    return userId;
  });
}

const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 30;
const WINDOW_MIN = 15;

/** Connexion sans double authentification (tests, outils). Refuse un compte protégé par un second facteur. */
export async function login(db: Database, emailInput: string, password: string, meta: RequestMeta) {
  const r = await beginLogin(db, emailInput, password, meta);
  if ("challenge" in r) throw unauthorized("Code de double authentification requis");
  return r.token;
}

/**
 * Premier temps de la connexion. Sans double authentification, ouvre la session ;
 * avec, renvoie un jeton d'étape à échanger contre un code (completeLoginChallenge).
 */
export async function beginLogin(
  db: Database,
  emailInput: string,
  password: string,
  meta: RequestMeta,
): Promise<{ token: string } | { challenge: string }> {
  const userId = await checkCredentials(db, emailInput, password, meta);
  const u = await one<{ totp_enabled_at: Date | null }>(db, "SELECT totp_enabled_at FROM users WHERE id=$1", [userId]);
  if (u?.totp_enabled_at) return { challenge: await createLoginChallenge(db, userId) };
  return { token: await createSession(db, userId, meta) };
}

async function checkCredentials(db: Database, emailInput: string, password: string, meta: RequestMeta): Promise<string> {
  const email = String(emailInput ?? "")
    .trim()
    .toLowerCase();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const fails = await one<{ by_email: unknown; by_ip: unknown }>(
    db,
    `SELECT count(*) FILTER (WHERE email=$1) AS by_email, count(*) FILTER (WHERE ip=$2) AS by_ip
     FROM login_attempts WHERE success = false AND created_at > $3 AND (email=$1 OR ip=$2)`,
    [email, meta.ip, since],
  );
  if (Number(fails?.by_email) >= MAX_FAILS_PER_EMAIL || Number(fails?.by_ip) >= MAX_FAILS_PER_IP) {
    throw tooMany(`Trop de tentatives. Réessayez dans ${WINDOW_MIN} minutes ou réinitialisez votre mot de passe.`);
  }
  const user = await one<{ id: string; password_hash: string; status: string }>(db, "SELECT id, password_hash, status FROM users WHERE email=$1", [
    email,
  ]);
  // Comparaison effectuée même si le compte n'existe pas, pour ne pas révéler son existence par le temps de réponse.
  const ok = await bcrypt.compare(String(password ?? ""), user?.password_hash ?? (await dummyHash()));
  await db.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,$3)", [email, meta.ip, ok && !!user]);
  if (!user || !ok) throw unauthorized("Adresse e-mail ou mot de passe incorrect");
  if (user.status === "suspended") throw forbidden("Ce compte est suspendu. Contactez l'assistance.");
  if (user.status === "deleted") throw unauthorized("Adresse e-mail ou mot de passe incorrect");
  if (await ssoEnforcedFor(db, email)) throw forbidden("Votre entreprise impose sa connexion unique : choisissez « Connexion d'entreprise ».");
  return user.id;
}

export async function createSession(db: Queryable, userId: string, meta: RequestMeta) {
  const membership = await one<{ org_id: string }>(db, "SELECT org_id FROM memberships WHERE user_id=$1 ORDER BY created_at LIMIT 1", [userId]);
  const token = randomToken();
  // Alerte de connexion depuis un appareil jamais vu (navigateur et système), sauf pour la toute première session.
  const known = await db.query<{ user_agent: string }>("SELECT DISTINCT user_agent FROM sessions WHERE user_id=$1", [userId]);
  const device = deviceName(meta.userAgent);
  if (known.length && !known.some((k) => deviceName(k.user_agent) === device)) {
    const u = await one<{ email: string; name: string }>(db, "SELECT email, name FROM users WHERE id=$1", [userId]);
    if (u)
      await sendMail(db, {
        kind: "new_device",
        to: u.email,
        subject: "Nouvelle connexion à votre compte Pilot-Makers",
        body: `Bonjour ${u.name},\n\nUne connexion à votre compte vient d'avoir lieu depuis un nouvel appareil : ${device}${meta.ip ? `, adresse ${meta.ip}` : ""}, le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.\n\nSi c'est vous, il n'y a rien à faire. Sinon, changez votre mot de passe et déconnectez cet appareil depuis « Mon compte » :\n${appUrl("/app/compte")}`,
      });
  }
  await db.query("INSERT INTO sessions (user_id, org_id, token_hash, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5,$6)", [
    userId,
    membership?.org_id ?? null,
    sha256(token),
    meta.userAgent.slice(0, 300),
    meta.ip,
    new Date(Date.now() + SESSION_DAYS * 24 * HOUR),
  ]);
  await audit(db, { orgId: membership?.org_id, userId, action: "session.create", ip: meta.ip });
  return token;
}

export async function logout(db: Database, token: string) {
  await db.query("UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [sha256(token)]);
}

/** Résout un jeton de session en contexte d'autorisation. Renvoie null si invalide. */
export async function contextFromToken(db: Database, token: string | undefined, meta: RequestMeta): Promise<Ctx | null> {
  if (!token) return null;
  const s = await one<{
    id: string;
    user_id: string;
    org_id: string | null;
    expires_at: Date;
    revoked_at: Date | null;
    last_seen_at: Date;
  }>(db, "SELECT id, user_id, org_id, expires_at, revoked_at, last_seen_at FROM sessions WHERE token_hash=$1", [sha256(token)]);
  if (!s || s.revoked_at || s.expires_at < new Date()) return null;
  const u = await one<{ email: string; name: string; status: string; is_platform_admin: boolean; totp_enabled_at: Date | null }>(
    db,
    "SELECT email, name, status, is_platform_admin, totp_enabled_at FROM users WHERE id=$1",
    [s.user_id],
  );
  if (!u || u.status === "suspended" || u.status === "deleted") return null;
  if (Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60_000) {
    await db.query("UPDATE sessions SET last_seen_at=now(), ip=$2 WHERE id=$1", [s.id, meta.ip]);
  }
  return buildContext(db, s.user_id, s.org_id, s.id, meta, u);
}

export async function buildContext(
  db: Database,
  userId: string,
  orgId: string | null,
  sessionId: string | null,
  meta: RequestMeta,
  u?: { email: string; name: string; is_platform_admin: boolean; totp_enabled_at?: Date | null },
): Promise<Ctx | null> {
  const user =
    u ??
    (await one<{ email: string; name: string; is_platform_admin: boolean; totp_enabled_at: Date | null }>(
      db,
      "SELECT email, name, is_platform_admin, totp_enabled_at FROM users WHERE id=$1",
      [userId],
    ));
  if (!user) return null;
  // Le rôle est toujours relu depuis l'adhésion : une session ne donne jamais accès à une entreprise dont l'utilisateur n'est plus membre.
  const m = await one<{ org_id: string; role: Role; job_function: JobFunction | null; status: string }>(
    db,
    `SELECT m.org_id, m.role, m.job_function, o.status FROM memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id=$1 AND ($2::uuid IS NULL OR m.org_id=$2) ORDER BY m.created_at LIMIT 1`,
    [userId, orgId],
  );
  if (!m) return null;
  return {
    db,
    userId,
    orgId: m.org_id,
    role: m.role,
    jobFunction: m.job_function,
    email: user.email,
    userName: user.name,
    isPlatformAdmin: user.is_platform_admin,
    twoFactor: !!user.totp_enabled_at,
    sessionId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    entitlements: await computeEntitlements(db, m.org_id, m.status),
  };
}

export async function requestPasswordReset(db: Database, emailInput: string) {
  const email = String(emailInput ?? "")
    .trim()
    .toLowerCase();
  await hitRate(db, "account.reset", email);
  const user = await one<{ id: string; name: string }>(db, "SELECT id, name FROM users WHERE email=$1 AND status <> 'deleted'", [email]);
  // Réponse identique que le compte existe ou non.
  if (!user) return;
  const token = await createEmailToken(db, user.id, "reset", 1);
  await sendMail(db, {
    kind: "password_reset",
    to: email,
    subject: "Réinitialisation de votre mot de passe",
    body: `Bonjour ${user.name},\n\nPour choisir un nouveau mot de passe :\n${appUrl("/reinitialiser?jeton=" + token)}\n\nCe lien est valable une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  });
  await audit(db, { userId: user.id, action: "account.reset_request" });
}

export async function resetPassword(db: Database, token: string, password: string) {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const hash = await hashPassword(parsed.data);
  await db.transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, token, "reset");
    await tx.query("UPDATE users SET password_hash=$2, email_verified_at=coalesce(email_verified_at, now()), updated_at=now() WHERE id=$1", [
      userId,
      hash,
    ]);
    // Toutes les sessions existantes sont fermées après un changement de mot de passe.
    await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
    await audit(tx, { userId, action: "account.reset_password" });
  });
}

export async function changePassword(ctx: Ctx, current: string, next: string) {
  const user = await one<{ password_hash: string }>(ctx.db, "SELECT password_hash FROM users WHERE id=$1", [ctx.userId]);
  if (!user || !(await bcrypt.compare(current, user.password_hash))) throw badRequest("Mot de passe actuel incorrect");
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  await ctx.db.query("UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1", [ctx.userId, await hashPassword(parsed.data)]);
  await ctx.db.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id <> $2 AND revoked_at IS NULL", [ctx.userId, ctx.sessionId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.change_password", ip: ctx.ip });
}

export async function updateUserPreferences(ctx: Ctx, input: { name?: string; locale?: string; timezone?: string }) {
  const locale = input.locale && ["fr", "en"].includes(input.locale) ? input.locale : undefined;
  let timezone: string | undefined;
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: input.timezone });
      timezone = input.timezone;
    } catch {
      throw badRequest("Fuseau horaire inconnu");
    }
  }
  await ctx.db.query(
    "UPDATE users SET name=coalesce($2,name), locale=coalesce($3,locale), timezone=coalesce($4,timezone), updated_at=now() WHERE id=$1",
    [ctx.userId, input.name?.trim() || null, locale ?? null, timezone ?? null],
  );
}

export async function listSessions(ctx: Ctx) {
  return ctx.db.query<{ id: string; user_agent: string; ip: string; created_at: Date; last_seen_at: Date }>(
    "SELECT id, user_agent, ip, created_at, last_seen_at FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC",
    [ctx.userId],
  );
}

export async function revokeSession(ctx: Ctx, sessionId: string) {
  await ctx.db.query("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2", [sessionId, ctx.userId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "session.revoke", target: sessionId, ip: ctx.ip });
}

export const DELETION_DELAY_DAYS = 30;

/**
 * Suppression encadrée : demande confirmée par e-mail, puis délai de 30 jours
 * pendant lequel la demande peut être annulée, puis anonymisation.
 */
export async function requestAccountDeletion(ctx: Ctx, password: string) {
  const user = await one<{ password_hash: string }>(ctx.db, "SELECT password_hash FROM users WHERE id=$1", [ctx.userId]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw badRequest("Mot de passe incorrect");
  const token = await createEmailToken(ctx.db, ctx.userId, "delete", 24);
  await sendMail(ctx.db, {
    kind: "account_delete",
    to: ctx.email,
    subject: "Confirmez la suppression de votre compte",
    body: `Bonjour,\n\nVous avez demandé la suppression de votre compte. Confirmez avec ce lien :\n${appUrl("/compte/suppression?jeton=" + token)}\n\nAprès confirmation, la suppression devient définitive au bout de ${DELETION_DELAY_DAYS} jours. Vous pouvez l'annuler d'ici là en vous reconnectant. Pensez à exporter vos données.`,
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.delete_request", ip: ctx.ip });
}

export async function confirmAccountDeletion(db: Database, token: string) {
  return db.transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, token, "delete");
    await tx.query("UPDATE users SET status='deletion_pending', deletion_requested_at=now(), updated_at=now() WHERE id=$1", [userId]);
    await audit(tx, { userId, action: "account.delete_confirmed" });
    return userId;
  });
}

export async function cancelAccountDeletion(ctx: Ctx) {
  await ctx.db.query("UPDATE users SET status='active', deletion_requested_at=NULL WHERE id=$1 AND status='deletion_pending'", [ctx.userId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.delete_canceled" });
}

/** Tâche périodique : anonymise les comptes dont le délai est écoulé. */
export async function purgeDeletedAccounts(db: Database, now = new Date()) {
  const due = await db.query<{ id: string }>("SELECT id FROM users WHERE status='deletion_pending' AND deletion_requested_at < $1", [
    new Date(now.getTime() - DELETION_DELAY_DAYS * 24 * HOUR),
  ]);
  for (const u of due) {
    await db.transaction(async (tx) => {
      // Les entreprises dont l'utilisateur est le seul membre sont supprimées avec leurs données,
      // archives comprises : la protection des documents émis est levée pour cette seule transaction.
      await tx.query("SELECT set_config('pilot.purge', 'on', true)");
      const orgs = await tx.query<{ org_id: string; n: unknown }>(
        `SELECT m.org_id, (SELECT count(*) FROM memberships x WHERE x.org_id = m.org_id) AS n
         FROM memberships m WHERE m.user_id=$1`,
        [u.id],
      );
      for (const o of orgs) if (Number(o.n) <= 1) await tx.query("DELETE FROM organizations WHERE id=$1", [o.org_id]);
      await tx.query("DELETE FROM memberships WHERE user_id=$1", [u.id]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
      await tx.query("UPDATE users SET status='deleted', email=$2, name='', password_hash='!', updated_at=now() WHERE id=$1", [
        u.id,
        `supprime-${u.id}@invalid`,
      ]);
      await audit(tx, { userId: u.id, action: "account.purged" });
    });
  }
  return { purged: due.length };
}

export function assertVerified(verifiedAt: Date | null) {
  if (!verifiedAt) throw new HttpError(403, "email_unverified", "Confirmez votre adresse e-mail pour continuer");
}

export const DEFAULT_CONDITIONS = `Devis valable pour la durée indiquée à compter de sa date d'émission.
Les travaux non prévus au présent devis feront l'objet d'un avenant.
Les quantités indiquées comme estimées seront vérifiées sur place avant le démarrage.`;

export const DEFAULT_MAIL_BODY = `Bonjour {client},

Veuillez trouver ci-joint notre devis {numero} pour : {objet}.
Montant : {total_ttc} TTC, valable jusqu'au {validite}.

Vous pouvez le consulter et y répondre en ligne :
{lien}

Bien cordialement,
{entreprise}`;

export const DEFAULT_REMINDERS = {
  enabled: false,
  firstDelayDays: 7,
  intervalDays: 7,
  maxReminders: 2,
  weekdays: [1, 2, 3, 4, 5],
  hourFrom: 9,
  hourTo: 18,
  subject: "Relance : votre devis {numero}",
  body: `Bonjour {client},

Nous revenons vers vous au sujet de notre devis {numero} ({objet}), valable jusqu'au {validite}.

{suivi}

Vous pouvez le consulter et y répondre en ligne :
{lien}

Bien cordialement,
{entreprise}`,
  minAmountCents: 0,
  adaptive: true,
};
