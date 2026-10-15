/**
 * Connexion unique d'entreprise (OpenID Connect) : code d'autorisation avec PKCE, puis vérification du jeton
 * d'identité (signature par les clés publiées du fournisseur, émetteur, destinataire, nonce et date d'expiration).
 */

import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from "node:crypto";

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const b64url = (b: Buffer) => b.toString("base64url");

export function pkcePair() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

export function authorizationUrl(
  d: OidcDiscovery,
  p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; email?: string },
) {
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", p.state);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.email) u.searchParams.set("login_hint", p.email);
  return u.toString();
}

/** Adresse de l'émetteur acceptée : https, sans identifiants ni fragment. */
export function issuerIssue(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "Adresse de l'émetteur invalide";
  }
  if (u.protocol !== "https:") return "L'émetteur doit être servi en https";
  if (u.username || u.password || u.hash) return "Adresse de l'émetteur invalide";
  return null;
}

export function checkDiscovery(raw: unknown, issuer: string): OidcDiscovery | string {
  const d = (raw ?? {}) as Record<string, unknown>;
  const trim = (s: string) => s.replace(/\/+$/, "");
  if (typeof d.issuer !== "string" || trim(d.issuer) !== trim(issuer)) return "La configuration publiée ne correspond pas à cet émetteur";
  for (const k of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof d[k] !== "string" || !String(d[k]).startsWith("https://")) return `Configuration incomplète : ${k} manquant`;
  }
  return { issuer: d.issuer, authorization_endpoint: String(d.authorization_endpoint), token_endpoint: String(d.token_endpoint), jwks_uri: String(d.jwks_uri) };
}

export interface IdClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

const ALGS: Record<string, { hash: string; ec?: boolean }> = { RS256: { hash: "sha256" }, ES256: { hash: "sha256", ec: true } };

/** Vérifie le jeton d'identité ; renvoie ses informations ou la raison du refus. */
export function verifyIdToken(
  token: string,
  keys: JsonWebKey[],
  expect: { issuer: string; audience: string; nonce: string; now?: number },
): { ok: true; claims: IdClaims } | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Jeton d'identité mal formé" };
  let header: { alg?: string; kid?: string };
  let claims: IdClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return { ok: false, error: "Jeton d'identité illisible" };
  }
  const alg = ALGS[header.alg ?? ""];
  if (!alg) return { ok: false, error: "Algorithme de signature refusé" };
  const candidates = keys.filter((k) => (!header.kid || (k as { kid?: string }).kid === header.kid) && (alg.ec ? k.kty === "EC" : k.kty === "RSA"));
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], "base64url");
  const signed = candidates.some((k) => {
    try {
      return verify(
        alg.hash,
        data,
        alg.ec ? { key: createPublicKey({ key: k, format: "jwk" }), dsaEncoding: "ieee-p1363" } : createPublicKey({ key: k, format: "jwk" }),
        sig,
      );
    } catch {
      return false;
    }
  });
  if (!signed) return { ok: false, error: "Signature du jeton d'identité invalide" };
  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  const trim = (s: string) => s.replace(/\/+$/, "");
  if (trim(claims.iss ?? "") !== trim(expect.issuer)) return { ok: false, error: "Émetteur du jeton inattendu" };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expect.audience)) return { ok: false, error: "Jeton destiné à une autre application" };
  if (typeof claims.exp !== "number" || claims.exp + 60 < now) return { ok: false, error: "Jeton d'identité expiré" };
  if (claims.nonce !== expect.nonce) return { ok: false, error: "Jeton d'identité rejoué ou inattendu" };
  if (!claims.sub) return { ok: false, error: "Identifiant de la personne manquant" };
  return { ok: true, claims };
}

export const emailDomain = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

/** Domaines saisis librement (« entreprise.fr, groupe.com ») ; null si l'un est invalide. */
export function parseDomains(raw: string): string[] | null {
  const list = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
  if (!list.length || list.length > 10) return null;
  return list.every((d) => /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) ? list : null;
}
