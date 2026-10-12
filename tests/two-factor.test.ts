import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { beginLogin, contextFromToken, login } from "@/lib/services/accounts";
import type { Ctx } from "@/lib/services/context";
import { beginTwoFactorSetup, checkSecondFactor, completeLoginChallenge, confirmTwoFactor, disableTwoFactor, twoFactorState } from "@/lib/services/two-factor";
import { open, seal } from "@/lib/secret-box";
import { base32Encode, currentStep, hotp, verifyTotp } from "@/lib/totp";
import { freshDb, meta, signUp } from "./helpers";

describe("codes à usage unique (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it("reproduit les vecteurs de test officiels", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(hotp(secret, currentStep(59_000))).toBe("287082");
    expect(hotp(secret, currentStep(1_111_111_109_000))).toBe("081804");
    expect(hotp(secret, currentStep(2_000_000_000_000))).toBe("279037");
  });

  it("tolère un pas d'écart et refuse le rejeu", () => {
    const now = 1_111_111_109_000;
    const step = currentStep(now);
    expect(verifyTotp(secret, hotp(secret, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, hotp(secret, step - 2), { now })).toBeNull();
    expect(verifyTotp(secret, hotp(secret, step), { now, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, "12345", { now })).toBeNull();
  });

  it("chiffre les secrets au repos", () => {
    const sealed = seal("secret");
    expect(sealed).not.toContain("secret");
    expect(open(sealed)).toBe("secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("autre").toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });
});

describe("connexion en deux étapes", () => {
  let db: Database;
  let ctx: Ctx;
  let secret: string;
  let codes: string[];

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "deux@etapes.fr");
  });

  it("active la double authentification après un premier code juste", async () => {
    const setup = await beginTwoFactorSetup(ctx);
    secret = setup.secret;
    expect(setup.svg).toContain("<svg");
    expect(setup.url).toContain("otpauth://totp/");
    await expect(confirmTwoFactor(ctx, "000000")).rejects.toMatchObject({ status: 400 });
    codes = await confirmTwoFactor(ctx, hotp(secret, currentStep()));
    expect(codes).toHaveLength(10);
    const row = (await db.query<{ totp_secret: string }>("SELECT totp_secret FROM users WHERE id=$1", [ctx.userId]))[0];
    expect(row.totp_secret).not.toContain(secret);
    expect((await twoFactorState(db, ctx.userId)).enabled).toBe(true);
  });

  it("exige le code après le mot de passe", async () => {
    await expect(login(db, "deux@etapes.fr", "MotDePasse2026", meta)).rejects.toMatchObject({ status: 401 });
    const r = await beginLogin(db, "deux@etapes.fr", "MotDePasse2026", meta);
    expect("challenge" in r).toBe(true);
    const challenge = (r as { challenge: string }).challenge;
    await expect(completeLoginChallenge(db, challenge, "111111")).rejects.toMatchObject({ status: 400 });
    // Le code de l'étape d'activation a déjà servi : on prend le pas suivant.
    const userId = await completeLoginChallenge(db, challenge, hotp(secret, currentStep() + 1));
    expect(userId).toBe(ctx.userId);
    await expect(completeLoginChallenge(db, challenge, hotp(secret, currentStep() + 1))).rejects.toMatchObject({ status: 401 });
  });

  it("accepte chaque code de secours une seule fois", async () => {
    await expect(checkSecondFactor(db, ctx.userId, codes[0].toUpperCase())).resolves.toBe("recovery");
    await expect(checkSecondFactor(db, ctx.userId, codes[0])).rejects.toMatchObject({ status: 400 });
    expect((await twoFactorState(db, ctx.userId)).recoveryLeft).toBe(9);
  });

  it("bloque l'étape après cinq codes faux", async () => {
    const r = (await beginLogin(db, "deux@etapes.fr", "MotDePasse2026", meta)) as { challenge: string };
    for (let i = 0; i < 5; i++) await expect(completeLoginChallenge(db, r.challenge, "999999")).rejects.toBeTruthy();
    await expect(completeLoginChallenge(db, r.challenge, codes[1])).rejects.toMatchObject({ status: 429 });
  });

  it("se désactive avec le mot de passe et un code", async () => {
    await expect(disableTwoFactor(ctx, "mauvais", codes[2])).rejects.toMatchObject({ status: 400 });
    await disableTwoFactor(ctx, "MotDePasse2026", codes[2]);
    const token = await login(db, "deux@etapes.fr", "MotDePasse2026", meta);
    expect((await contextFromToken(db, token, meta))?.twoFactor).toBe(false);
  });
});
