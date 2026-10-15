import { generateKeyPairSync, sign, type JsonWebKey } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { checkDiscovery, issuerIssue, parseDomains, verifyIdToken } from "@/lib/oidc";
import { login } from "@/lib/services/accounts";
import type { Ctx } from "@/lib/services/context";
import { finishSso, getSsoConfig, saveSsoConfig, ssoEnforcedFor, startSso } from "@/lib/services/sso";
import { freshDb, signUp } from "./helpers";

const ISSUER = "https://idp.exemple.fr";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1", alg: "RS256", use: "sig" };
const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;

function idToken(claims: Record<string, unknown>, key = privateKey, kid = "k1") {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${enc({ alg: "RS256", typ: "JWT", kid })}.${enc(claims)}`;
  return `${head}.${sign("sha256", Buffer.from(head), key).toString("base64url")}`;
}

/** Fournisseur d'identité simulé : configuration publiée, échange du code et clés publiques. */
function idp(claims: (nonce: string) => Record<string, unknown>) {
  let nonce = "";
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
    if (url === `${ISSUER}/.well-known/openid-configuration`)
      return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` });
    if (url === `${ISSUER}/token`) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("code") !== "bon-code" || !body.get("code_verifier")) return new Response("refus", { status: 400 });
      return json({ id_token: idToken(claims(nonce)) });
    }
    if (url === `${ISSUER}/jwks`) return json({ keys: [jwk] });
    return new Response("inconnu", { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls, setNonce: (n: string) => (nonce = n) };
}

const base = (nonce: string) => ({
  iss: ISSUER,
  aud: "app-1",
  sub: "u-1",
  nonce,
  exp: Math.floor(Date.now() / 1000) + 300,
  email: "paul@renov-lyon.fr",
  email_verified: true,
});

describe("connexion unique : vérifications", () => {
  it("contrôle émetteur, configuration publiée et domaines", () => {
    expect(issuerIssue("http://idp.fr")).toContain("https");
    expect(issuerIssue("https://idp.fr")).toBeNull();
    expect(checkDiscovery({ issuer: "https://autre.fr" }, "https://idp.fr")).toContain("ne correspond pas");
    expect(parseDomains("@renov-lyon.fr, groupe.com")).toEqual(["renov-lyon.fr", "groupe.com"]);
    expect(parseDomains("pas un domaine")).toBeNull();
  });

  it("n'accepte qu'un jeton signé, destiné à l'application, valable et avec le bon nonce", () => {
    const expect_ = { issuer: ISSUER, audience: "app-1", nonce: "n1" };
    expect(verifyIdToken(idToken(base("n1")), [jwk], expect_)).toMatchObject({ ok: true });
    expect(verifyIdToken(idToken(base("n1"), other), [jwk], expect_)).toMatchObject({ ok: false, error: "Signature du jeton d'identité invalide" });
    expect(verifyIdToken(idToken({ ...base("n1"), aud: "autre" }), [jwk], expect_)).toMatchObject({ ok: false });
    expect(verifyIdToken(idToken({ ...base("n1"), exp: 1000 }), [jwk], expect_)).toMatchObject({ ok: false, error: "Jeton d'identité expiré" });
    expect(verifyIdToken(idToken(base("autre")), [jwk], expect_)).toMatchObject({ ok: false });
    expect(verifyIdToken(idToken({ ...base("n1"), iss: "https://pirate.fr" }), [jwk], expect_)).toMatchObject({ ok: false });
    const [h, p] = idToken(base("n1")).split(".");
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
    expect(verifyIdToken(none, [jwk], expect_)).toMatchObject({ ok: false, error: "Algorithme de signature refusé" });
    expect(h).toBeTruthy();
  });
});

describe("connexion unique : parcours complet", () => {
  let db: Database;
  let boss: Ctx;
  let paulId: string;
  beforeAll(async () => {
    db = await freshDb();
    boss = await signUp(db, "gerant@renov-lyon.fr", "Rénov Lyon");
    const paul = await signUp(db, "paul@renov-lyon.fr", "Autre");
    paulId = paul.userId;
    await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member')", [boss.orgId, paulId]);
  });

  it("enregistre la configuration du gérant, secret scellé", async () => {
    const { fetcher } = idp(base);
    const input = { issuer: ISSUER, clientId: "app-1", clientSecret: "s3cret", domains: "renov-lyon.fr", enforced: false };
    await expect(saveSsoConfig(boss, { ...input, issuer: "http://idp.fr" }, fetcher)).rejects.toMatchObject({ status: 400 });
    await expect(saveSsoConfig(boss, { ...input, domains: "autre.fr", enforced: true }, fetcher)).rejects.toThrow(/votre propre adresse/);
    await saveSsoConfig(boss, input, fetcher);
    expect(await getSsoConfig(boss)).toMatchObject({ issuer: ISSUER, clientId: "app-1", hasSecret: true, domains: ["renov-lyon.fr"], enforced: false });
    const [row] = await db.query<{ client_secret: string }>("SELECT client_secret FROM org_sso");
    expect(row.client_secret).not.toContain("s3cret");
    const intruder = await signUp(db, "x@pirate.fr", "Pirate");
    await expect(saveSsoConfig(intruder, { ...input, domains: "renov-lyon.fr", enforced: false }, fetcher)).rejects.toMatchObject({ status: 403 });
  });

  it("ouvre la session du membre après vérification, une seule fois par demande", async () => {
    const p = idp(base);
    await expect(startSso(db, "paul@inconnu.fr", "", p.fetcher)).rejects.toMatchObject({ status: 404 });
    const url = new URL(await startSso(db, "paul@renov-lyon.fr", "/app/devis", p.fetcher));
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("login_hint")).toBe("paul@renov-lyon.fr");
    p.setNonce(url.searchParams.get("nonce")!);
    const state = url.searchParams.get("state")!;
    const r = await finishSso(db, { state, code: "bon-code" }, p.fetcher);
    expect(r).toEqual({ userId: paulId, next: "/app/devis" });
    await expect(finishSso(db, { state, code: "bon-code" }, p.fetcher)).rejects.toMatchObject({ status: 401 });
  });

  it("refuse un mauvais code, une adresse non vérifiée ou une personne hors de l'entreprise", async () => {
    const run = async (claims: (n: string) => Record<string, unknown>, code = "bon-code") => {
      const p = idp(claims);
      const url = new URL(await startSso(db, "paul@renov-lyon.fr", "https://pirate.fr", p.fetcher));
      p.setNonce(url.searchParams.get("nonce")!);
      return finishSso(db, { state: url.searchParams.get("state")!, code }, p.fetcher);
    };
    await expect(run(base, "mauvais")).rejects.toMatchObject({ status: 401 });
    await expect(run((n) => ({ ...base(n), email_verified: false }))).rejects.toMatchObject({ status: 401 });
    await expect(run((n) => ({ ...base(n), email: "chef@renov-lyon.fr" }))).rejects.toMatchObject({ status: 403 });
    await expect(run((n) => ({ ...base(n), email: "paul@pirate.fr" }))).rejects.toMatchObject({ status: 403 });
    expect((await run(base)).next).toBe("/app");
  });

  it("refuse le mot de passe quand la connexion unique est imposée", async () => {
    const meta = { ip: "203.0.113.9", userAgent: "test" };
    expect(await login(db, "paul@renov-lyon.fr", "MotDePasse2026", meta)).toBeTruthy();
    await saveSsoConfig(boss, { issuer: ISSUER, clientId: "app-1", clientSecret: "", domains: "renov-lyon.fr", enforced: true }, idp(base).fetcher);
    expect(await ssoEnforcedFor(db, "PAUL@renov-lyon.fr")).toBe(true);
    await expect(login(db, "paul@renov-lyon.fr", "MotDePasse2026", meta)).rejects.toMatchObject({ status: 403 });
  });
});
