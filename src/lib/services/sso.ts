/** Connexion unique d'entreprise : l'entreprise relie son annuaire (OpenID Connect) et ses membres s'y identifient. */

import type { JsonWebKey } from "node:crypto";
import { one, type Queryable } from "@/lib/db";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/http";
import { authorizationUrl, checkDiscovery, emailDomain, issuerIssue, parseDomains, pkcePair, verifyIdToken, type OidcDiscovery } from "@/lib/oidc";
import { isSealed, open, seal } from "@/lib/secret-box";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl } from "./mail";

type Fetcher = typeof fetch;
type Config = { org_id: string; issuer: string; client_id: string; client_secret: string; domains: string[]; enforced: boolean };

export const SSO_CALLBACK = "/api/auth/sso/retour";
const REQUEST_TTL_MS = 10 * 60_000;

export async function getSsoConfig(ctx: Ctx) {
  requirePermission(ctx, "settings");
  const c = await one<Config>(ctx.db, "SELECT * FROM org_sso WHERE org_id=$1", [ctx.orgId]);
  return c ? { issuer: c.issuer, clientId: c.client_id, hasSecret: !!c.client_secret, domains: c.domains, enforced: c.enforced } : null;
}

async function discover(issuer: string, fetcher: Fetcher): Promise<OidcDiscovery> {
  let raw: unknown;
  try {
    const res = await fetcher(`${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    raw = await res.json();
  } catch {
    throw badRequest("Configuration de l'émetteur introuvable : vérifiez son adresse");
  }
  const d = checkDiscovery(raw, issuer);
  if (typeof d === "string") throw badRequest(d);
  return d;
}

/** Enregistre la configuration après avoir lu celle publiée par le fournisseur d'identité. */
export async function saveSsoConfig(
  ctx: Ctx,
  input: { issuer: string; clientId: string; clientSecret: string; domains: string; enforced: boolean },
  fetcher: Fetcher = fetch,
) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const issuer = input.issuer.trim().replace(/\/+$/, "");
  const bad = issuerIssue(issuer);
  if (bad) throw badRequest(bad);
  const clientId = input.clientId.trim();
  if (!clientId || clientId.length > 300) throw badRequest("Identifiant de l'application manquant");
  const domains = parseDomains(input.domains);
  if (!domains) throw badRequest("Indiquez le ou les domaines de messagerie de l'entreprise, par exemple entreprise.fr");
  const me = await one<{ email: string }>(ctx.db, "SELECT email FROM users WHERE id=$1", [ctx.userId]);
  if (input.enforced && !domains.includes(emailDomain(me?.email ?? "")))
    throw badRequest("Pour imposer la connexion unique, votre propre adresse doit faire partie des domaines : vous pourrez ainsi vous connecter.");
  const taken = await one(ctx.db, "SELECT 1 FROM org_sso WHERE org_id <> $1 AND domains && $2::text[]", [ctx.orgId, domains]);
  if (taken) throw forbidden("Un de ces domaines est déjà relié à une autre entreprise");
  await discover(issuer, fetcher);
  const current = await one<Config>(ctx.db, "SELECT * FROM org_sso WHERE org_id=$1", [ctx.orgId]);
  const secret = input.clientSecret.trim() ? seal(input.clientSecret.trim()) : current?.client_secret;
  if (!secret) throw badRequest("Secret de l'application manquant");
  await ctx.db.query(
    `INSERT INTO org_sso (org_id, issuer, client_id, client_secret, domains, enforced) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id) DO UPDATE SET issuer=$2, client_id=$3, client_secret=$4, domains=$5, enforced=$6, updated_at=now()`,
    [ctx.orgId, issuer, clientId, secret, domains, input.enforced],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "sso.configure", data: { issuer, domains, enforced: input.enforced }, ip: ctx.ip });
}

export async function deleteSsoConfig(ctx: Ctx) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  await ctx.db.query("DELETE FROM org_sso WHERE org_id=$1", [ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "sso.remove", ip: ctx.ip });
}

async function configForEmail(db: Queryable, email: string) {
  const d = emailDomain(email);
  return d ? one<Config>(db, "SELECT * FROM org_sso WHERE $1 = ANY(domains)", [d]) : null;
}

/** Vrai si l'adresse appartient à une entreprise qui impose la connexion unique (le mot de passe est alors refusé). */
export async function ssoEnforcedFor(db: Queryable, email: string) {
  return !!(await configForEmail(db, email))?.enforced;
}

const safeNext = (next: string) => (/^\/app(\/[\w\-/?=&%.]*)?$/.test(next) ? next : "");

/** Début de la connexion : adresse du fournisseur d'identité où envoyer la personne. */
export async function startSso(db: Queryable, email: string, next: string, fetcher: Fetcher = fetch, now = new Date()) {
  const c = await configForEmail(db, email);
  if (!c) throw notFound("Aucune connexion d'entreprise pour cette adresse : connectez-vous avec votre mot de passe");
  const d = await discover(c.issuer, fetcher);
  const state = randomToken(24);
  const nonce = randomToken(16);
  const { verifier, challenge } = pkcePair();
  await db.query("DELETE FROM sso_requests WHERE expires_at < $1", [now]);
  await db.query("INSERT INTO sso_requests (state_hash, org_id, nonce, code_verifier, next_path, expires_at) VALUES ($1,$2,$3,$4,$5,$6)", [
    sha256(state),
    c.org_id,
    nonce,
    verifier,
    safeNext(next),
    new Date(now.getTime() + REQUEST_TTL_MS),
  ]);
  return authorizationUrl(d, { clientId: c.client_id, redirectUri: appUrl(SSO_CALLBACK), state, nonce, challenge, email: email.trim() });
}

/** Retour du fournisseur : code échangé, jeton vérifié, puis membre de l'entreprise retrouvé par son adresse. */
export async function finishSso(db: Queryable, p: { state: string; code: string }, fetcher: Fetcher = fetch, now = new Date()) {
  if (!p.state || !p.code) throw badRequest("Réponse du fournisseur d'identité incomplète");
  const [req] = await db.query<{ org_id: string; nonce: string; code_verifier: string; next_path: string; expires_at: Date }>(
    "DELETE FROM sso_requests WHERE state_hash=$1 RETURNING org_id, nonce, code_verifier, next_path, expires_at",
    [sha256(p.state)],
  );
  if (!req || new Date(req.expires_at) < now) throw unauthorized("Demande de connexion expirée : recommencez");
  const c = await one<Config>(db, "SELECT * FROM org_sso WHERE org_id=$1", [req.org_id]);
  if (!c) throw unauthorized("La connexion d'entreprise a été retirée");
  const d = await discover(c.issuer, fetcher);
  const secret = isSealed(c.client_secret) ? open(c.client_secret) : c.client_secret;
  let tokens: { id_token?: string };
  let keys: JsonWebKey[];
  try {
    const res = await fetcher(d.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: p.code,
        redirect_uri: appUrl(SSO_CALLBACK),
        client_id: c.client_id,
        client_secret: secret,
        code_verifier: req.code_verifier,
      }).toString(),
    });
    if (!res.ok) throw new Error(String(res.status));
    tokens = await res.json();
    keys = ((await (await fetcher(d.jwks_uri)).json()) as { keys?: JsonWebKey[] }).keys ?? [];
  } catch {
    throw unauthorized("Le fournisseur d'identité a refusé la connexion");
  }
  const v = verifyIdToken(tokens.id_token ?? "", keys, { issuer: c.issuer, audience: c.client_id, nonce: req.nonce, now: now.getTime() });
  if (!v.ok) throw unauthorized(v.error);
  const email = (v.claims.email ?? "").trim().toLowerCase();
  if (!email || v.claims.email_verified === false) throw unauthorized("Adresse e-mail non vérifiée par le fournisseur d'identité");
  if (!c.domains.includes(emailDomain(email))) throw forbidden("Cette adresse ne fait pas partie des domaines de l'entreprise");
  const user = await one<{ id: string; status: string }>(
    db,
    "SELECT u.id, u.status FROM users u JOIN memberships m ON m.user_id=u.id AND m.org_id=$2 WHERE u.email=$1",
    [email, c.org_id],
  );
  if (!user || user.status !== "active")
    throw forbidden("Aucun compte actif pour cette adresse dans l'entreprise : demandez une invitation à votre responsable");
  await db.query("UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id=$1", [user.id]);
  await audit(db, { orgId: c.org_id, userId: user.id, action: "sso.login", data: { issuer: c.issuer } });
  return { userId: user.id, next: req.next_path || "/app" };
}
