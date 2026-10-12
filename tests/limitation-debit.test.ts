import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { hitRate, purgeRateLimits, RATE_RULES } from "@/lib/rate-limit";
import { register, requestPasswordReset } from "@/lib/services/accounts";
import { freshDb } from "./helpers";

let db: Database;

beforeAll(async () => {
  db = await freshDb();
  process.env.RATE_LIMIT = "on";
});

afterAll(() => {
  process.env.RATE_LIMIT = "off";
});

describe("limitation de débit", () => {
  it("refuse au-delà de la limite avec le délai d'attente, puis repart à la fenêtre suivante", async () => {
    const t0 = new Date("2026-10-12T10:00:05Z");
    const { limit, windowSec } = RATE_RULES["public.respond"];
    for (let i = 0; i < limit; i++) await hitRate(db, "public.respond", "203.0.113.7", t0);
    await expect(hitRate(db, "public.respond", "203.0.113.7", t0)).rejects.toMatchObject({ status: 429, details: { retryAfter: windowSec - 5 } });
    // Les autres adresses et les autres règles ne sont pas touchées.
    await hitRate(db, "public.respond", "203.0.113.8", t0);
    await hitRate(db, "public.view", "203.0.113.7", t0);
    await hitRate(db, "public.respond", "203.0.113.7", new Date(t0.getTime() + windowSec * 1000));
    // Sans identifiant, rien n'est compté.
    for (let i = 0; i < limit + 2; i++) await hitRate(db, "public.respond", "", t0);
  });

  it("protège la création de comptes et la réinitialisation du mot de passe", async () => {
    const meta = { ip: "198.51.100.4", userAgent: "vitest" };
    const input = (n: number) => ({
      email: `compte${n}@exemple.fr`,
      password: "MotDePasse2026",
      name: "Paul",
      company: "Test",
      trade: "carrelage",
      acceptTerms: true,
    });
    for (let n = 0; n < RATE_RULES["account.register"].limit; n++) await register(db, input(n), meta);
    await expect(register(db, input(99), meta)).rejects.toMatchObject({ status: 429 });
    await register(db, input(100), { ...meta, ip: "198.51.100.5" });

    for (let n = 0; n < RATE_RULES["account.reset"].limit; n++) await requestPasswordReset(db, "compte1@exemple.fr");
    await expect(requestPasswordReset(db, "Compte1@exemple.fr ")).rejects.toMatchObject({ status: 429 });
  });

  it("purge les fenêtres anciennes", async () => {
    await hitRate(db, "api.ip", "192.0.2.1", new Date(Date.now() - 3 * 86400000));
    expect(await purgeRateLimits(db)).toBeGreaterThanOrEqual(1);
  });
});
