import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGRESSIONS, regressionReport } from "@/lib/quality/regressions";

describe("registre des bogues corrigés", () => {
  it("chaque correction pointe vers un test permanent qui existe", () => {
    expect(REGRESSIONS.length).toBeGreaterThan(0);
    expect(new Set(REGRESSIONS.map((r) => r.id)).size).toBe(REGRESSIONS.length);
    for (const r of REGRESSIONS) {
      expect(r.id).toMatch(/^R-\d{3,}$/);
      expect(existsSync(r.file), r.file).toBe(true);
      const src = readFileSync(r.file, "utf8");
      // Nom du test entre guillemets, apostrophes ou accents graves (test généré pour plusieurs téléphones).
      expect([`"${r.test}"`, `'${r.test}'`, `\`${r.test}\``].some((q) => src.includes(q)), `${r.id} : ${r.test}`).toBe(true);
    }
  });

  it("résume le registre du plus récent au plus ancien", () => {
    const rep = regressionReport([
      { id: "R-001", date: "2026-01-02", kind: "produit", title: "a", fix: "b", file: "f", test: "t" },
      { id: "R-002", date: "2026-03-04", kind: "test", title: "a", fix: "b", file: "f", test: "t" },
      { id: "R-003", date: "2026-03-04", kind: "produit", title: "a", fix: "b", file: "g", test: "t" },
    ]);
    expect(rep).toMatchObject({ total: 3, product: 2, tests: 2 });
    expect(rep.entries.map((e) => e.id)).toEqual(["R-003", "R-002", "R-001"]);
  });
});
