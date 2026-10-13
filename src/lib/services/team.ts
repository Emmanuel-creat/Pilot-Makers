/** Utilisateurs d'une entreprise, selon les limites de l'abonnement. */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/security";
import { emailSchema } from "./accounts";
import { assertCanAddMember } from "./billing";
import type { Ctx, Role } from "./context";
import { audit, JOB_FUNCTIONS, type JobFunction, requirePermission, requireRole, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";

export async function listMembers(ctx: Ctx) {
  return ctx.db.query<{ user_id: string; email: string; name: string; role: Role; job_function: JobFunction | null; created_at: Date; qualification: string }>(
    "SELECT u.id AS user_id, u.email, u.name, m.role, m.job_function, m.created_at, m.qualification FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY m.created_at",
    [ctx.orgId],
  );
}

export async function inviteMember(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const parsed = z
    .object({
      email: emailSchema,
      role: z.enum(["admin", "member"]).optional(),
      jobFunction: z.enum(["", "gerant", "conducteur", "secretariat", "ouvrier"]).optional().default(""),
    })
    .safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  await assertCanAddMember(ctx.db, ctx);
  const { email } = parsed.data;
  const jobFunction = (parsed.data.jobFunction || null) as JobFunction | null;
  // La fonction détermine le rôle ; sans fonction, le rôle choisi s'applique.
  const role = jobFunction ? JOB_FUNCTIONS[jobFunction].role : (parsed.data.role ?? "member");
  const already = await one(ctx.db, "SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND u.email=$2", [ctx.orgId, email]);
  if (already) throw conflict("Cette personne fait déjà partie de l'entreprise");
  const token = randomToken();
  await ctx.db.query(
    "INSERT INTO email_tokens (user_id, purpose, token_hash, data, expires_at) VALUES ($1,'invite',$2,$3,$4)",
    [ctx.userId, sha256(token), JSON.stringify({ orgId: ctx.orgId, role, email, jobFunction }), new Date(Date.now() + 7 * 86_400_000)],
  );
  await sendMail(ctx.db, {
    orgId: ctx.orgId,
    kind: "invite",
    to: email,
    subject: "Invitation à rejoindre un espace Pilot-Makers",
    body: `Bonjour,\n\n${ctx.userName} vous invite à rejoindre son entreprise sur Pilot-Makers.\nAcceptez l'invitation (connexion ou création de compte avec cette adresse) :\n${appUrl("/invitation?jeton=" + token)}\n\nCe lien est valable 7 jours.`,
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "team.invite", data: { email, role }, ip: ctx.ip });
  return { token };
}

/** Acceptation par un utilisateur connecté dont l'adresse correspond à l'invitation. */
export async function acceptInvite(ctx: Ctx, token: string) {
  return ctx.db.transaction(async (tx) => {
    const row = await one<{
      id: string;
      data: { orgId: string; role: Role; email: string; jobFunction?: JobFunction | null };
      expires_at: Date;
      used_at: Date | null;
    }>(
      tx,
      "SELECT id, data, expires_at, used_at FROM email_tokens WHERE token_hash=$1 AND purpose='invite'",
      [sha256(token)],
    );
    if (!row || row.used_at || row.expires_at < new Date()) throw badRequest("Invitation invalide ou expirée");
    if (row.data.email !== ctx.email) throw forbidden("Cette invitation a été envoyée à une autre adresse");
    await tx.query("UPDATE email_tokens SET used_at=now() WHERE id=$1", [row.id]);
    await tx.query("INSERT INTO memberships (user_id, org_id, role, job_function) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [
      ctx.userId,
      row.data.orgId,
      row.data.role,
      row.data.jobFunction ?? null,
    ]);
    if (ctx.sessionId) await tx.query("UPDATE sessions SET org_id=$2 WHERE id=$1", [ctx.sessionId, row.data.orgId]);
    await audit(tx, { orgId: row.data.orgId, userId: ctx.userId, action: "team.join" });
    return row.data.orgId;
  });
}

export async function changeRole(ctx: Ctx, userId: string, role: Role) {
  requireRole(ctx, "owner");
  if (userId === ctx.userId) throw badRequest("Vous ne pouvez pas modifier votre propre rôle");
  if (!["admin", "member"].includes(role)) throw badRequest("Rôle invalide");
  // Un changement de rôle direct annule la fonction, qui ne correspondrait plus.
  const r = await ctx.db.query("UPDATE memberships SET role=$3, job_function=NULL WHERE org_id=$1 AND user_id=$2 AND role <> 'owner' RETURNING id", [
    ctx.orgId,
    userId,
    role,
  ]);
  if (!r.length) throw notFound("Membre introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "team.role", target: userId, data: { role }, ip: ctx.ip });
}

/** Fonction d'un membre : fixe aussi son rôle. Le titulaire du compte reste gérant. */
export async function setMemberFunction(ctx: Ctx, userId: string, fn: string) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  if (fn && !(fn in JOB_FUNCTIONS)) throw badRequest("Fonction inconnue");
  if (userId === ctx.userId) throw badRequest("Vous ne pouvez pas modifier votre propre fonction");
  const m = await one<{ role: Role }>(ctx.db, "SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2", [ctx.orgId, userId]);
  if (!m) throw notFound("Membre introuvable");
  const jobFunction = (fn || null) as JobFunction | null;
  if (m.role === "owner") {
    if (jobFunction && jobFunction !== "gerant") throw badRequest("Le titulaire du compte garde tous les droits : fonction Gérant");
    await ctx.db.query("UPDATE memberships SET job_function=$3 WHERE org_id=$1 AND user_id=$2", [ctx.orgId, userId, jobFunction]);
  } else {
    await ctx.db.query("UPDATE memberships SET job_function=$3, role=$4 WHERE org_id=$1 AND user_id=$2", [
      ctx.orgId,
      userId,
      jobFunction,
      jobFunction ? JOB_FUNCTIONS[jobFunction].role : m.role,
    ]);
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "team.function", target: userId, data: { jobFunction }, ip: ctx.ip });
}

export async function removeMember(ctx: Ctx, userId: string) {
  requirePermission(ctx, "settings");
  if (userId === ctx.userId) throw badRequest("Vous ne pouvez pas vous retirer vous-même");
  const r = await ctx.db.query("DELETE FROM memberships WHERE org_id=$1 AND user_id=$2 AND role <> 'owner' RETURNING id", [ctx.orgId, userId]);
  if (!r.length) throw notFound("Membre introuvable");
  await ctx.db.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND org_id=$2 AND revoked_at IS NULL", [userId, ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "team.remove", target: userId, ip: ctx.ip });
}

export async function listUserOrgs(ctx: Ctx) {
  return ctx.db.query<{ org_id: string; trade_name: string; role: Role }>(
    "SELECT m.org_id, o.trade_name, m.role FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=$1 ORDER BY o.trade_name",
    [ctx.userId],
  );
}

export async function switchOrg(ctx: Ctx, orgId: string) {
  const m = await one(ctx.db, "SELECT 1 FROM memberships WHERE user_id=$1 AND org_id=$2", [ctx.userId, orgId]);
  if (!m) throw forbidden();
  if (ctx.sessionId) await ctx.db.query("UPDATE sessions SET org_id=$2 WHERE id=$1", [ctx.sessionId, orgId]);
}
