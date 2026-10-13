import { describe, expect, it } from "vitest";
import { frenchList, plainSummary } from "@/lib/plain-summary";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

const snap = (p: { quote?: Partial<QuoteSnapshot["quote"]>; [k: string]: unknown } = {}) =>
  ({
    validUntil: "2026-11-12",
    org: { trade_name: "Martin Rénovation", legal_name: "", vat_regime: "normal" },
    customer: { type: "particulier" },
    sections: [
      { id: "a", title: "Démolition", lines: [{ kind: "item", estimated: false }] },
      { id: "b", title: "Carrelage", lines: [{ kind: "item", estimated: true }] },
    ],
    calc: { totalTtcCents: 485000, options: null },
    ...p,
    quote: {
      title: "Rénovation de la salle de bain",
      site: { line1: "", line2: "", postalCode: "", city: "Lyon" },
      depositPercent: "30",
      estimatedStart: "semaine du 2 novembre",
      estimatedDuration: "2 semaines",
      ...(p.quote ?? {}),
    },
  }) as unknown as QuoteSnapshot;

describe("résumé du devis en langage simple", () => {
  it("liste les éléments en français", () => {
    expect(frenchList([])).toBe("");
    expect(frenchList(["a"])).toBe("a");
    expect(frenchList(["a", "b", "c"])).toBe("a, b et c");
  });

  it("dit quoi, combien, quand et ce que la signature engage", () => {
    const t = plainSummary(snap({ consumer: { withdrawal: true, reducedVatBp: [1000] } }));
    expect(t).toEqual([
      "Martin Rénovation vous propose de réaliser ces travaux à Lyon : Rénovation de la salle de bain.",
      "Le devis est découpé en 2 parties : Démolition et Carrelage.",
      "Le prix total est de 4 850,00 € TTC, c'est-à-dire TVA comprise : c'est la somme que vous paierez.",
      "Un acompte de 30 %, soit 1 455,00 €, vous sera demandé, au plus tôt sept jours après la signature.",
      "Calendrier : début envisagé semaine du 2 novembre, durée prévue 2 semaines.",
      "Une ligne est estimée : son montant pourra être ajusté après vérification sur place.",
      "Après avoir signé, vous avez 14 jours pour changer d'avis, sans frais ni justification.",
      "La TVA réduite suppose que le logement est achevé depuis plus de deux ans : en acceptant, vous l'attestez.",
      "Cette proposition est valable jusqu'au 12/11/2026. Rien n'est engagé tant que vous ne l'avez pas acceptée.",
    ]);
  });

  it("franchise, variantes, aides et devis minimal", () => {
    const t = plainSummary(
      snap({
        org: { trade_name: "", legal_name: "Durand SARL", vat_regime: "franchise" },
        sections: [
          {
            id: "a",
            title: "Base",
            choice: { name: "sol", label: "Base" },
            lines: [
              { kind: "item", estimated: true },
              { kind: "item", estimated: true },
            ],
          },
          { id: "b", title: "Confort", choice: { name: "sol", label: "Confort" }, lines: [] },
        ],
        quote: {
          title: "",
          site: { line1: "", line2: "", postalCode: "", city: "" },
          depositPercent: "abc",
          estimatedStart: "",
          estimatedDuration: "",
          energyAid: { programs: ["mpr", "cee"], domains: [], visitDate: "", estimatedAid: "" },
        },
      }),
    );
    expect(t[0]).toBe("Durand SARL vous propose de réaliser ces travaux : voir le détail ci-dessous.");
    expect(t).toContain("Le prix total est de 4 850,00 €, sans TVA à ajouter.");
    expect(t).toContain("Certaines parties sont proposées au choix ou en option : le prix final dépend de ce que vous retenez.");
    expect(t).toContain("2 lignes sont estimées : leur montant pourra être ajusté après vérification sur place.");
    expect(t).toContain("Ces travaux peuvent vous ouvrir droit à des aides : MaPrimeRénov' et Certificats d'économies d'énergie (CEE).");
    expect(t.some((x) => x.startsWith("Un acompte") || x.startsWith("Calendrier") || x.startsWith("Le devis est découpé"))).toBe(false);
    expect(plainSummary(snap({ quote: { depositPercent: "15" } }))).toContain("Un acompte de 15 %, soit 727,50 €, vous sera demandé à la signature.");
  });
});
