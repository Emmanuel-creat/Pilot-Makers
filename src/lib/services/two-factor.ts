/**
 * Double authentification par application (codes à 6 chiffres) et codes de secours.
 *
 * La clé secrète est chiffrée au repos. Les codes de secours ne sont conservés
 * que sous forme d'empreinte et chacun ne sert qu'une fois.
 */

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import type { Database, Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { badRequest, tooMany, unauthorized } from "@/lib/http";
import { open, seal } from "@/lib/secret-box";
import { randomToken, sha256 } from "@/lib/security";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUrl, verifyTotp } from "@/lib/totp";
import type { Ctx } from "./context";
import { audit } from "./context";

const CHALLENGE_MINUTES = 10;
const CHALLENGE_MAX_ATTEMPTS = 5;

export interface TwoFactorState {
  enabled: boolean;
  enabledAt: Date | null;
  recoveryLeft: number;
}

export async function twoFactorState(q: Queryable, userId: string): Promise<TwoFactorState> {
  const u = await one<{ totp_enabled_at: Date | null; totp_recovery_hashes: string[] }>(
    q,
    "SELECT totp_enabled_at, totp_recovery_hashes FROM users WHERE id=$1",
    [userId],
  );
  return { enabled: !!u?.totp_enabled_at, enabledAt: u?.totp_enabled_at ?? null, recoveryLeft: u?.totp_recovery_hashes?.length ?? 0 };
}

/** Prépare l'activation : nouvelle clé en attente, QR code et clé lisible. */
export async function beginTwoFactorSetup(ctx: Ctx) {
  const secret = generateTotpSecret();
  await ctx.db.query("UPDATE users SET totp_pending_secret=$2 WHERE id=$1", [ctx.userId, seal(secret)]);
  const url = otpauthUrl(secret, ctx.email);
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, url, svg };
}

/** Lit la clé en attente pour réafficher le QR code après un rechargement. */
export async function pendingTwoFactorSetup(ctx: Ctx) {
  const u = await one<{ totp_pending_secret: string | null }>(ctx.db, "SELECT totp_pending_secret FROM users WHERE id=$1", [ctx.userId]);
  if (!u?.totp_pending_secret) return null;
  const secret = open(u.totp_pending_secret);
  const url = otpauthUrl(secret, ctx.email);
  return { secret, url, svg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) };
}

/** Confirme l'activation avec un premier code. Renvoie les codes de secours, affichés une seule fois. */
export async function confirmTwoFactor(ctx: Ctx, code: string): Promise<string[]> {
  const u = await one<{ totp_pending_secret: string | null }>(ctx.db, "SELECT totp_pending_secret FROM users WHERE id=$1", [ctx.userId]);
  if (!u?.totp_pending_secret) throw badRequest("Commencez par afficher le QR code");
  const secret = open(u.totp_pending_secret);
  const step = verifyTotp(secret, code);
  if (step == null) throw badRequest("Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.");
  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(normalizeRecoveryCode(c), 10)));
  await ctx.db.query(
    `UPDATE users SET totp_secret=$2, totp_pending_secret=NULL, totp_enabled_at=now(), totp_last_step=$3,
       totp_recovery_hashes=$4::jsonb, updated_at=now() WHERE id=$1`,
    [ctx.userId, seal(secret), step, JSON.stringify(hashes)],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.2fa_enable", ip: ctx.ip });
  return codes;
}

export async function regenerateRecoveryCodes(ctx: Ctx, code: string): Promise<string[]> {
  await checkSecondFactor(ctx.db, ctx.userId, code);
  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(normalizeRecoveryCode(c), 10)));
  await ctx.db.query("UPDATE users SET totp_recovery_hashes=$2::jsonb WHERE id=$1", [ctx.userId, JSON.stringify(hashes)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.2fa_recovery_regenerate", ip: ctx.ip });
  return codes;
}

export async function disableTwoFactor(ctx: Ctx, password: string, code: string) {
  const u = await one<{ password_hash: string }>(ctx.db, "SELECT password_hash FROM users WHERE id=$1", [ctx.userId]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw badRequest("Mot de passe incorrect");
  await checkSecondFactor(ctx.db, ctx.userId, code);
  await ctx.db.query(
    `UPDATE users SET totp_secret=NULL, totp_pending_secret=NULL, totp_enabled_at=NULL, totp_last_step=NULL,
       totp_recovery_hashes='[]'::jsonb, updated_at=now() WHERE id=$1`,
    [ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.2fa_disable", ip: ctx.ip });
}

/**
 * Vérifie un code d'application ou un code de secours. Un code de secours
 * utilisé est retiré ; un code d'application ne peut pas être rejoué.
 */
export async function checkSecondFactor(q: Queryable, userId: string, code: string): Promise<"totp" | "recovery"> {
  const u = await one<{ totp_secret: string | null; totp_last_step: string | number | null; totp_recovery_hashes: string[] }>(
    q,
    "SELECT totp_secret, totp_last_step, totp_recovery_hashes FROM users WHERE id=$1",
    [userId],
  );
  if (!u?.totp_secret) throw badRequest("La double authentification n'est pas activée");
  const clean = String(code ?? "").trim();
  if (/^\d[\d\s]{5,7}$/.test(clean)) {
    const step = verifyTotp(open(u.totp_secret), clean, { lastStep: u.totp_last_step == null ? null : Number(u.totp_last_step) });
    if (step != null) {
      await q.query("UPDATE users SET totp_last_step=$2 WHERE id=$1", [userId, step]);
      return "totp";
    }
  } else {
    const norm = normalizeRecoveryCode(clean);
    const hashes = u.totp_recovery_hashes ?? [];
    for (let i = 0; i < hashes.length; i++) {
      if (norm.length === 10 && (await bcrypt.compare(norm, hashes[i]))) {
        const rest = hashes.filter((_, j) => j !== i);
        await q.query("UPDATE users SET totp_recovery_hashes=$2::jsonb WHERE id=$1", [userId, JSON.stringify(rest)]);
        await audit(q, { userId, action: "account.2fa_recovery_used" });
        return "recovery";
      }
    }
  }
  throw badRequest("Code incorrect");
}

export async function createLoginChallenge(q: Queryable, userId: string): Promise<string> {
  const token = randomToken();
  await q.query("INSERT INTO login_challenges (user_id, token_hash, expires_at) VALUES ($1,$2,$3)", [
    userId,
    sha256(token),
    new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
  ]);
  return token;
}

/** Second temps de la connexion : renvoie l'utilisateur si le code est bon. */
export async function completeLoginChallenge(db: Database, token: string, code: string): Promise<string> {
  const c = await one<{ id: string; user_id: string; attempts: number; expires_at: Date; used_at: Date | null }>(
    db,
    "SELECT id, user_id, attempts, expires_at, used_at FROM login_challenges WHERE token_hash=$1",
    [sha256(String(token ?? ""))],
  );
  if (!c || c.used_at || c.expires_at < new Date()) throw unauthorized("Étape de connexion expirée. Reconnectez-vous.");
  if (c.attempts >= CHALLENGE_MAX_ATTEMPTS) throw tooMany("Trop de codes incorrects. Reconnectez-vous.");
  await db.query("UPDATE login_challenges SET attempts=attempts+1 WHERE id=$1", [c.id]);
  await checkSecondFactor(db, c.user_id, code);
  await db.query("UPDATE login_challenges SET used_at=now() WHERE id=$1", [c.id]);
  return c.user_id;
}
