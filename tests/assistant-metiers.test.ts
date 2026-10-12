import { describe, expect, it } from "vitest";
import { LIBRARY, LIBRARY_TRADES, PROFESSIONS, tradeForProfession } from "@/lib/library";
import { countIn, localProvider, splitClauses } from "@/lib/services/assistant";

const propose = (text: string, profession = "") => localProvider.propose({ text, catalog: [], profession });
const labels = async (text: string, profession = "") => (await propose(text, profession)).sections.flatMap((s) => s.lines.map((l) => l.label));

describe("bibliothèques par métier", () => {
  it("couvre 15 métiers, chacun avec des prestations, des questions et des points de contrôle", () => {
    const trades = LIBRARY_TRADES.filter((t) => t.code !== "commun");
    expect(trades).toHaveLength(15);
    for (const t of trades) {
      const lib = LIBRARY[t.code];
      expect(lib.items.length).toBeGreaterThanOrEqual(5);
      expect(lib.questions.length).toBeGreaterThan(0);
      expect(lib.checks.length).toBeGreaterThan(0);
      for (const it of lib.items) expect(it.when?.length, it.name).toBeGreaterThan(0);
    }
    const names = Object.values(LIBRARY).flatMap((l) => l.items.map((i) => i.name.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });

  it("relie le métier choisi à l'inscription à sa bibliothèque", () => {
    expect(PROFESSIONS).toContain("Couvreur");
    expect(tradeForProfession("Électricien")).toBe("electricite");
    expect(tradeForProfession("Inconnu")).toBeNull();
  });
});

describe("assistant de préparation par métier", () => {
  const cases: [string, string, RegExp][] = [
    ["peinture", "Repeindre les murs de la chambre de 30 m², reboucher les fissures avant.", /Peinture murs/],
    ["plomberie", "Remplacer le WC et poser un nouveau lavabo dans la salle de bain.", /WC suspendu/],
    ["électricité", "Créer 4 prises et un point lumineux dans le bureau.", /prise de courant/],
    ["maçonnerie", "Ouverture dans un mur porteur entre la cuisine et le séjour.", /mur porteur/],
    ["plâtrerie", "Créer une cloison en placo de 12 m² pour faire une chambre.", /Cloison en plaques/],
    ["isolation", "Isolation des combles perdus de 80 m².", /combles perdus/],
    ["menuiserie", "Remplacer 3 fenêtres double vitrage dans le salon.", /fenêtre double vitrage/],
    ["sols", "Poser du parquet flottant dans la chambre de 14 m².", /parquet flottant/],
    ["couverture", "Remplacer des tuiles cassées et changer les gouttières sur 18 ml.", /gouttières/],
    ["chauffage", "Installer une pompe à chaleur air-eau à la place de la chaudière fioul.", /pompe à chaleur/],
    ["charpente", "Traitement de la charpente contre les capricornes.", /Traitement curatif/],
    ["façade", "Ravalement de façade avec traitement des fissures.", /ravalement/],
    ["serrurerie", "Porte claquée, ouverture de porte puis remplacement du cylindre.", /cylindre/],
    ["extérieurs", "Créer une terrasse en bois de 25 m² et poser une clôture de 30 ml.", /Terrasse en lames/],
    ["carrelage", "Poser du carrelage au sol dans la cuisine de 12 m².", /carrelage au sol/],
  ];
  for (const [trade, text, expected] of cases) {
    it(`reconnaît le métier ${trade}`, async () => {
      const p = await propose(text);
      const all = p.sections.flatMap((s) => s.lines);
      expect(all.map((l) => l.label).join(" | ")).toMatch(expected);
      expect(p.trades.length).toBeGreaterThan(0);
      for (const l of all) {
        expect(p.explanations[l.id]).toMatch(/Proposée car la description mentionne/);
        if (l.kind === "item") expect(l.estimated).toBe(true);
      }
    });
  }

  it("rattache les quantités et les nombres à la bonne prestation", async () => {
    const p = await propose("Créer 4 prises et deux points lumineux. Poser une clôture de 30 ml.");
    const lines = p.sections.flatMap((s) => s.lines);
    expect(lines.find((l) => /prise/.test(l.label))?.quantity).toBe("4");
    expect(lines.find((l) => /point lumineux/.test(l.label))?.quantity).toBe("2");
    expect(lines.find((l) => /clôture/.test(l.label))?.quantity).toBe("30");
  });

  it("ne confond pas dépose et pose, ni démolition et création", async () => {
    const l = await labels("Abattre la cloison du couloir puis déposer le carrelage existant.");
    expect(l).toContain("Démolition de cloison");
    expect(l).toContain("Dépose de carrelage existant");
    expect(l).not.toContain("Cloison en plaques de plâtre sur ossature");
    expect(l).not.toContain("Pose de carrelage au sol");
  });

  it("ne voit pas une prise de courant dans le mot entreprise", async () => {
    const p = await propose("Peinture du plafond de la cuisine, peinture fournie par l'entreprise.");
    expect(p.trades.map((t) => t.code)).not.toContain("electricite");
  });

  it("propose les points de contrôle et les questions du métier", async () => {
    const p = await propose("Isolation des combles perdus de 80 m².");
    expect(p.checklist.join(" ")).toMatch(/5,5 %/);
    expect(p.questions.join(" ")).toMatch(/aides/);
    const line = p.sections.flatMap((s) => s.lines).find((l) => /combles/.test(l.label))!;
    expect(line.vatPercent).toBe("5,5");
    expect(line.quantity).toBe("80");
  });

  it("utilise le métier de l'entreprise quand la description ne le précise pas", async () => {
    const p = await propose("Remplacer le tableau ancien chez un particulier.", "Électricien");
    expect(p.sections.flatMap((s) => s.lines).some((l) => /tableau/.test(l.label))).toBe(true);
  });

  it("reprend le prix du catalogue de l'entreprise quand il existe", async () => {
    const catalog = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Pose carrelage sol 60x60",
        subcategory: "",
        description: "",
        unit: "m²",
        unit_price4: 520000n,
        unit_cost4: null,
        vat_bp: 1000,
        category: "main_oeuvre",
      },
    ] as never;
    const p = await localProvider.propose({ text: "Poser du carrelage au sol sur 10 m².", catalog });
    const line = p.sections.flatMap((s) => s.lines).find((l) => l.catalogItemId)!;
    expect(line.label).toBe("Pose carrelage sol 60x60");
    expect(line.unitPrice).toBe("52,00");
    expect(p.explanations[line.id]).toMatch(/votre catalogue/);
  });

  it("découpe et compte correctement", () => {
    expect(splitClauses("Faïence sur 14,5 m2, joints et plinthes.")).toEqual(["Faïence sur 14,5 m2", "joints", "plinthes"]);
    expect(countIn("créer 3 prises")).toBe(3);
    expect(countIn("sur 12 m²")).toBeNull();
    expect(countIn("trois radiateurs")).toBe(3);
  });
});
