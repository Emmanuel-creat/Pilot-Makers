import { describe, expect, it } from "vitest";
import { EASY_TILES, daySentence, matchTile, plain, tilesFor } from "@/lib/easy-mode";

describe("mode facile", () => {
  it("chaque pictogramme a une phrase lue, des mots-clés sans accents et un lien de l'application", () => {
    expect(new Set(EASY_TILES.map((t) => t.id)).size).toBe(EASY_TILES.length);
    for (const t of EASY_TILES) {
      expect(t.href.startsWith("/app/")).toBe(true);
      expect(t.say.length).toBeGreaterThan(10);
      for (const k of t.keywords) expect(plain(k)).toBe(k);
    }
  });

  it("les factures ne sont proposées qu'aux personnes qui y ont accès", () => {
    expect(tilesFor({ billing: false }).some((t) => t.id === "factures")).toBe(false);
    expect(tilesFor({ billing: true }).some((t) => t.id === "factures")).toBe(true);
  });

  it("une phrase dictée ouvre le bon écran, même sans accents ni majuscules", () => {
    expect(matchTile("Je veux faire un DEVIS")?.id).toBe("devis");
    expect(matchTile("je dois pointer mes heures")?.id).toBe("pointage");
    expect(matchTile("j'ai un ticket d'essence")?.id).toBe("frais");
    expect(matchTile("est-ce que la facture est payée")?.id).toBe("factures");
    expect(matchTile("Où je vais aujourd'hui")?.id).toBe("journee");
    expect(matchTile("un devis pour un nouveau client")?.id).toBe("devis");
    expect(matchTile("bonjour")).toBeNull();
    expect(matchTile("   ")).toBeNull();
    expect(matchTile("la facture", tilesFor({ billing: false }))).toBeNull();
  });

  it("le résumé du jour se lit en phrases courtes", () => {
    expect(daySentence({ jobs: [], quotes: { count: 0 } })).toBe("Aujourd'hui, aucun chantier n'est prévu. Aucun devis n'attend de réponse.");
    expect(daySentence({ jobs: [{ title: "Salle de bains Martin", city: "Lyon" }], quotes: { count: 1 } })).toBe(
      "Aujourd'hui, vous avez 1 chantier. Salle de bains Martin, à Lyon. 1 devis attend la réponse du client.",
    );
    const many = Array.from({ length: 7 }, (_, i) => ({ title: `Chantier ${i + 1}`, city: "" }));
    const s = daySentence({ jobs: many, quotes: { count: 3 } });
    expect(s).toContain("vous avez 7 chantiers");
    expect(s).toContain("Et 2 autres.");
    expect(s).toContain("3 devis attendent");
  });
});
