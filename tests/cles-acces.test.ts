import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { b64url, decodeCbor, parseAuthData, verifyAssertion, verifyRegistration } from "@/lib/auth/webauthn";
import { beginPasskeyLogin, beginPasskeyRegistration, finishPasskeyLogin, finishPasskeyRegistration, listPasskeys, removePasskey } from "@/lib/services/passkeys";
import { freshDb, signUp } from "./helpers";

/* Authentificateur simulé ---------------------------------------------------- */

function cbor(v: unknown): Buffer {
  const head = (major: number, n: number) =>
    n < 24
      ? Buffer.from([(major << 5) | n])
      : n < 256
        ? Buffer.from([(major << 5) | 24, n])
        : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error("type");
}

const ORIGIN = "http://localhost:3000";
const RP = "localhost";

class FakeAuthenticator {
  key = generateKeyPairSync("ec", { namedCurve: "P-256" });
  credId = new Uint8Array(Buffer.from("cle-de-test-0001"));
  count = 0;
  constructor(private flags = 0x05) {}

  authData(withKey: boolean, rp = RP) {
    const head = Buffer.concat([createHash("sha256").update(rp).digest(), Buffer.from([this.flags | (withKey ? 0x40 : 0)]), Buffer.alloc(4)]);
    head.writeUInt32BE(this.count, 33);
    if (!withKey) return head;
    const jwk = this.key.publicKey.export({ format: "jwk" });
    const cose = new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
    ]);
    const len = Buffer.from([this.credId.length >> 8, this.credId.length & 255]);
    return Buffer.concat([head, Buffer.alloc(16), len, this.credId, cbor(cose)]);
  }

  create(challenge: string, origin = ORIGIN) {
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin }));
    const attestationObject = cbor(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", new Uint8Array(this.authData(true))],
      ]),
    );
    return { id: b64url(this.credId), response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(attestationObject) } };
  }

  get(challenge: string, userHandle: string | null, signer: KeyObject = this.key.privateKey) {
    this.count++;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN }));
    const authenticatorData = this.authData(false);
    const signature = sign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientDataJSON).digest()]), signer);
    return {
      id: b64url(this.credId),
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authenticatorData), signature: b64url(signature), userHandle },
    };
  }
}

const exp = (challenge: string) => ({ challenge, origin: ORIGIN, rpId: RP });

describe("vérification WebAuthn", () => {
  it("lit le CBOR et les données de l'authentificateur", () => {
    const m = decodeCbor(new Uint8Array(cbor(new Map<unknown, unknown>([["a", -300], [1, new Uint8Array([7])]])))).value as Map<unknown, unknown>;
    expect(m.get("a")).toBe(-300);
    expect(() => decodeCbor(new Uint8Array([0x5a, 0, 0]))).toThrow("tronquée");
    const a = parseAuthData(new Uint8Array(new FakeAuthenticator().authData(true)));
    expect(a.userVerified).toBe(true);
    expect(a.publicKey?.get(3)).toBe(-7);
  });

  it("enregistre une clé puis vérifie la signature du défi", () => {
    const dev = new FakeAuthenticator();
    const reg = verifyRegistration(dev.create("defi1").response, exp("defi1"));
    expect(reg.alg).toBe(-7);
    const stored = { publicKey: reg.publicKey, alg: reg.alg, signCount: 0 };
    expect(verifyAssertion(dev.get("defi2", null).response, exp("defi2"), stored)).toEqual({ signCount: 1 });
    expect(() => verifyAssertion(dev.get("defi3", null).response, exp("autre"), stored)).toThrow("Défi");
    const thief = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    expect(() => verifyAssertion(dev.get("defi4", null, thief).response, exp("defi4"), stored)).toThrow("Signature");
    expect(() => verifyAssertion(dev.get("defi5", null).response, exp("defi5"), { ...stored, signCount: 99 })).toThrow("dupliquée");
  });

  it("refuse un autre site et un appareil qui n'a pas vérifié l'utilisateur", () => {
    const dev = new FakeAuthenticator();
    expect(() => verifyRegistration(dev.create("d", "https://faux-site.example").response, exp("d"))).toThrow("autre site");
    const noUv = new FakeAuthenticator(0x01);
    expect(() => verifyRegistration(noUv.create("d").response, exp("d"))).toThrow("vérifié");
  });
});

describe("clés d'accès du compte", () => {
  it("ajoute une clé, connecte avec, puis la retire", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "cle@exemple.fr");
    const dev = new FakeAuthenticator();
    const opts = await beginPasskeyRegistration(ctx);
    expect(opts.publicKey.authenticatorSelection.userVerification).toBe("required");
    const id = await finishPasskeyRegistration(ctx, { challengeId: opts.challengeId, name: "", credential: dev.create(opts.publicKey.challenge) }, "Chrome sur Android");
    expect((await listPasskeys(ctx))[0]).toMatchObject({ id, name: "Chrome sur Android", lastUsedAt: null });
    // Un défi ne sert qu'une fois.
    await expect(finishPasskeyRegistration(ctx, { challengeId: opts.challengeId, credential: dev.create(opts.publicKey.challenge) })).rejects.toThrow("Défi expiré");

    const login = await beginPasskeyLogin(db, "1.2.3.4");
    const handle = b64url(Buffer.from(ctx.userId));
    expect(await finishPasskeyLogin(db, { challengeId: login.challengeId, credential: dev.get(login.publicKey.challenge, handle) }, "1.2.3.4")).toBe(ctx.userId);
    expect((await listPasskeys(ctx))[0].lastUsedAt).not.toBeNull();

    const other = await signUp(db, "autre@exemple.fr", "Autre");
    const l2 = await beginPasskeyLogin(db, "1.2.3.4");
    await expect(
      finishPasskeyLogin(db, { challengeId: l2.challengeId, credential: dev.get(l2.publicKey.challenge, b64url(Buffer.from(other.userId))) }, "1.2.3.4"),
    ).rejects.toThrow("autre compte");

    await removePasskey(ctx, id);
    const l3 = await beginPasskeyLogin(db, "1.2.3.4");
    await expect(finishPasskeyLogin(db, { challengeId: l3.challengeId, credential: dev.get(l3.publicKey.challenge, handle) }, "1.2.3.4")).rejects.toThrow("inconnue");
  });

  it("interdit à l'assistance de gérer les clés d'un compte", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "support@exemple.fr");
    await expect(beginPasskeyRegistration({ ...ctx, supportAccess: { reason: "aide", expiresAt: new Date() } })).rejects.toThrow("support");
  });
});
