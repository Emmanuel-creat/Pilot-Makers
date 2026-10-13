import { describe, expect, it } from "vitest";
import { ALLOW_MARK, forbiddenFile, scanText } from "../scripts/secrets-rules.mjs";

// Faux secrets assemblés à l'exécution, pour que l'analyse du dépôt ne les signale pas.
const fake = {
  stripe: "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc",
  aws: "A" + "KIAIOSFODNN7EXAMPLE",
  github: "gh" + "p_" + "a".repeat(36),
  key: "-----BEGIN RSA " + "PRIVATE KEY-----",
  url: "postgres" + "://pilot:Tr3sS3cret@db.exemple.fr:5432/pilot",
};

describe("analyse des secrets", () => {
  it("détecte les clés d'API, clés privées et mots de passe en clair", () => {
    const text = Object.values(fake).join("\n");
    expect(scanText(text).map((p) => p.rule)).toEqual(["stripe", "aws", "github", "cle-privee", "url-mot-de-passe"]);
  });

  it("ignore les exemples, les variables et les lignes marquées", () => {
    expect(scanText("DATABASE_URL=postgres://pilot:motdepasse@localhost/pilot")).toEqual([]);
    expect(scanText("DATABASE_URL=postgres://pilot:${DB_PASSWORD}@localhost/pilot")).toEqual([]);
    expect(scanText("DATABASE_URL=postgres://localhost/pilot")).toEqual([]);
    expect(scanText("STRIPE_SECRET_KEY=sk_test_xxx")).toEqual([]);
    expect(scanText(`${fake.stripe} // ${ALLOW_MARK}`)).toEqual([]);
  });

  it("refuse les fichiers d'environnement réels, pas le modèle", () => {
    expect(forbiddenFile(".env")).toBe(true);
    expect(forbiddenFile("apps/web/.env.production")).toBe(true);
    expect(forbiddenFile(".env.example")).toBe(false);
    expect(forbiddenFile("src/lib/env.ts")).toBe(false);
  });
});
