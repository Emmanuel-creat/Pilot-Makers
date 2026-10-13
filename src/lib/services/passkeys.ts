/**
 * Clés d'accès (passkeys) : se connecter sans mot de passe, avec l'empreinte, le visage ou le code du téléphone.
 *
 * Une clé d'accès vérifie l'appareil et la personne : elle vaut double authentification et la connexion
 * ne demande pas en plus le code de l'application d'authentification. Le mot de passe reste utilisable.
 */

import { z } from "zod";
import type { Database } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, forbidden, isUuid, notFound, unauthorized } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { randomToken } from "@/lib/security";
import { WebAuthnError, b64url, relyingParty, verifyAssertion, verifyRegistration } from "@/lib/auth/webauthn";
import type { Ctx } from "./context";
import { audit } from "./context";

export const PASSKEYS_MAX = 10;
const CHALLENGE_MS = 5 * 60_000;

export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Seule la personne elle-même gère ses clés, jamais l'assistance qui consulte son compte. */
function requireOwnAccount(ctx: Ctx) {
  if (ctx.supportAccess) throw forbidden("L'accès support ne peut pas gérer les clés d'accès");
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

async function newChallenge(db: Database, purpose: "register" | "login", userId: string | null) {
  const challenge = randomToken(32);
  const r = await one<{ id: string }>(db, "INSERT INTO webauthn_challenges (user_id, purpose, challenge, expires_at) VALUES ($1,$2,$3,$4) RETURNING id", [
    userId,
    purpose,
    challenge,
    new Date(Date.now() + CHALLENGE_MS),
  ]);
  await db.query("DELETE FROM webauthn_challenges WHERE expires_at < now() - interval '1 day'");
  return { id: r!.id, challenge: b64url(Buffer.from(challenge)) };
}

/** Consomme un défi : une seule utilisation, dans les 5 minutes. */
async function useChallenge(db: Database, id: unknown, purpose: "register" | "login", userId: string | null) {
  if (typeof id !== "string" || !isUuid(id)) throw badRequest("Défi manquant");
  const r = await one<{ challenge: string; user_id: string | null }>(
    db,
    "UPDATE webauthn_challenges SET used_at=now() WHERE id=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > now() RETURNING challenge, user_id",
    [id, purpose],
  );
  if (!r || (userId && r.user_id !== userId)) throw badRequest("Défi expiré : recommencez");
  return b64url(Buffer.from(r.challenge));
}

export async function listPasskeys(ctx: Ctx): Promise<Passkey[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    "SELECT id, name, created_at, last_used_at FROM user_passkeys WHERE user_id=$1 ORDER BY created_at",
    [ctx.userId],
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), createdAt: iso(r.created_at)!, lastUsedAt: iso(r.last_used_at) }));
}

/** Options transmises à navigator.credentials.create. */
export async function beginPasskeyRegistration(ctx: Ctx) {
  requireOwnAccount(ctx);
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM user_passkeys WHERE user_id=$1", [ctx.userId]);
  if (num(n?.n) >= PASSKEYS_MAX) throw badRequest(`${PASSKEYS_MAX} clés d'accès au plus par compte`);
  const user = await one<{ email: string; name: string }>(ctx.db, "SELECT email, name FROM users WHERE id=$1", [ctx.userId]);
  const existing = await ctx.db.query<{ credential_id: string }>("SELECT credential_id FROM user_passkeys WHERE user_id=$1", [ctx.userId]);
  const c = await newChallenge(ctx.db, "register", ctx.userId);
  const rp = relyingParty();
  return {
    challengeId: c.id,
    publicKey: {
      challenge: c.challenge,
      rp: { id: rp.rpId, name: rp.name },
      user: { id: b64url(Buffer.from(ctx.userId)), name: user!.email, displayName: user!.name || user!.email },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -8 },
        { type: "public-key", alg: -257 },
      ],
      timeout: CHALLENGE_MS,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: existing.map((e) => ({ type: "public-key", id: e.credential_id })),
    },
  };
}

const registerSchema = z.object({
  challengeId: z.string(),
  name: z.string().trim().max(60).default(""),
  credential: z.object({
    id: z.string(),
    response: z.object({ clientDataJSON: z.string(), attestationObject: z.string(), transports: z.array(z.string()).max(10).optional() }),
  }),
});

export async function finishPasskeyRegistration(ctx: Ctx, raw: unknown, device = "") {
  requireOwnAccount(ctx);
  const p = registerSchema.safeParse(raw);
  if (!p.success) throw badRequest("Réponse du navigateur incomplète");
  const challenge = await useChallenge(ctx.db, p.data.challengeId, "register", ctx.userId);
  const rp = relyingParty();
  let reg: ReturnType<typeof verifyRegistration>;
  try {
    reg = verifyRegistration(p.data.credential.response, { challenge, origin: rp.origin, rpId: rp.rpId });
  } catch (e) {
    if (e instanceof WebAuthnError) throw badRequest(e.message);
    throw e;
  }
  const taken = await one(ctx.db, "SELECT 1 FROM user_passkeys WHERE credential_id=$1", [reg.credentialId]);
  if (taken) throw badRequest("Cette clé d'accès est déjà enregistrée");
  const name = p.data.name || device || "Clé d'accès";
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO user_passkeys (user_id, credential_id, public_key, alg, sign_count, transports, name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [ctx.userId, reg.credentialId, reg.publicKey, reg.alg, reg.signCount, JSON.stringify(p.data.credential.response.transports ?? []), name.slice(0, 60)],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "passkey.add", target: r!.id, data: { name }, ip: ctx.ip });
  return r!.id;
}

export async function removePasskey(ctx: Ctx, id: string) {
  requireOwnAccount(ctx);
  if (!isUuid(id)) throw notFound("Clé d'accès introuvable");
  const r = await one<{ name: string }>(ctx.db, "DELETE FROM user_passkeys WHERE id=$1 AND user_id=$2 RETURNING name", [id, ctx.userId]);
  if (!r) throw notFound("Clé d'accès introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "passkey.remove", target: id, data: { name: r.name }, ip: ctx.ip });
}

/** Options transmises à navigator.credentials.get : l'appareil propose les clés qu'il connaît pour ce site. */
export async function beginPasskeyLogin(db: Database, ip: string) {
  await hitRate(db, "passkey.login", ip);
  const c = await newChallenge(db, "login", null);
  const rp = relyingParty();
  return { challengeId: c.id, publicKey: { challenge: c.challenge, rpId: rp.rpId, timeout: CHALLENGE_MS, userVerification: "required", allowCredentials: [] } };
}

const loginSchema = z.object({
  challengeId: z.string(),
  credential: z.object({
    id: z.string().max(1400),
    response: z.object({ clientDataJSON: z.string(), authenticatorData: z.string(), signature: z.string(), userHandle: z.string().nullish() }),
  }),
});

/** Vérifie la signature et renvoie l'utilisateur à connecter. */
export async function finishPasskeyLogin(db: Database, raw: unknown, ip: string): Promise<string> {
  await hitRate(db, "passkey.login", ip);
  const p = loginSchema.safeParse(raw);
  if (!p.success) throw badRequest("Réponse du navigateur incomplète");
  const challenge = await useChallenge(db, p.data.challengeId, "login", null);
  const key = await one<{ id: string; user_id: string; public_key: Uint8Array; alg: number; sign_count: unknown; status: string }>(
    db,
    "SELECT k.id, k.user_id, k.public_key, k.alg, k.sign_count, u.status FROM user_passkeys k JOIN users u ON u.id=k.user_id WHERE k.credential_id=$1",
    [p.data.credential.id],
  );
  if (!key) throw unauthorized("Clé d'accès inconnue : connectez-vous avec votre mot de passe puis ajoutez-la dans Mon compte");
  if (key.status !== "active" && key.status !== "deletion_pending") throw unauthorized("Ce compte ne peut pas se connecter");
  const handle = p.data.credential.response.userHandle;
  if (handle && Buffer.from(handle, "base64url").toString() !== key.user_id) throw unauthorized("Clé d'accès d'un autre compte");
  const rp = relyingParty();
  let result: { signCount: number };
  try {
    result = verifyAssertion(
      p.data.credential.response,
      { challenge, origin: rp.origin, rpId: rp.rpId },
      { publicKey: new Uint8Array(key.public_key), alg: num(key.alg), signCount: num(key.sign_count) },
    );
  } catch (e) {
    if (e instanceof WebAuthnError) throw unauthorized(e.message);
    throw e;
  }
  await db.query("UPDATE user_passkeys SET sign_count=$2, last_used_at=now() WHERE id=$1", [key.id, result.signCount]);
  await audit(db, { userId: key.user_id, action: "passkey.login", target: key.id, ip });
  return key.user_id;
}
