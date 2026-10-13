import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { answersToText, followUps, parseAnswer, REPLACED_QUESTIONS } from "@/lib/services/assistant-followups";
import { detectMeasures, proposeDraft } from "@/lib/services/assistant";
import type { Ctx } from "@/lib/services/context";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "relances@exemple.fr");
  await completeProfile(ctx);
});

const proposal = (lines: { kind: string; unit: string; label: string }[], text: string) => ({
  sections: [{ lines }],
  detected: detectMeasures(text),
});

describe("questions de relance de l'assistant", () => {
  it("demande la surface, la hauteur et le support quand ils manquent", () => {
    const text = "Peinture des murs du séjour";
    const ids = followUps(text, proposal([{ kind: "pending", unit: "m²", label: "Peinture des murs" }], text)).map((f) => f.id);
    expect(ids).toEqual(["surface", "hauteur", "support", "fournitures", "acces"]);
  });

  it("ne repose pas une question déjà réglée par la description", () => {
    const text = "Peinture des murs sur plaque de plâtre, 32 m², hauteur sous plafond 2,5 m, peinture fournie, 3e étage avec ascenseur";
    expect(followUps(text, proposal([{ kind: "item", unit: "m²", label: "Peinture" }], text))).toEqual([]);
  });

  it("demande le volume de gravats après une dépose", () => {
    const text = "Dépose de l'ancien carrelage de la cuisine, 12 m², matériaux fournis, accès de plain-pied";
    expect(followUps(text, proposal([], text)).map((f) => f.id)).toContain("gravats");
  });

  it("transforme les réponses en phrases que l'assistant sait relire", () => {
    const text = "Peinture des murs du séjour";
    const items = followUps(text, proposal([{ kind: "pending", unit: "m²", label: "Peinture des murs" }], text));
    const added = answersToText(items, { surface: "28,5", hauteur: "2.5", support: "plâtre ou plaque de plâtre", acces: "inventé", fournitures: "" });
    expect(added).toBe("Surface à traiter : 28,5 m². Hauteur sous plafond : 2,5 m. Support : plâtre ou plaque de plâtre.");
    expect(detectMeasures(added).surfaceM2).toBe(28.5);
    // Une fois la réponse ajoutée, la question disparaît.
    const again = `${text}. ${added}`;
    expect(followUps(again, proposal([{ kind: "item", unit: "m²", label: "Peinture des murs" }], again)).map((f) => f.id)).toEqual([
      "fournitures",
      "acces",
    ]);
  });

  it("refuse les réponses numériques invalides", () => {
    expect(parseAnswer("abc")).toBeNull();
    expect(parseAnswer("0")).toBeNull();
    expect(parseAnswer("-3")).toBeNull();
    expect(parseAnswer(" 12,75 ")).toBe(12.75);
  });

  it("relance la proposition avec les réponses : les quantités se remplissent", async () => {
    const text = "Dépose de l'ancien carrelage et pose de carrelage au sol dans la cuisine";
    const first = await proposeDraft(ctx, { text });
    const ids = (first.followUps ?? []).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["surface", "gravats", "fournitures", "acces"]));
    expect(first.questions.some((q) => REPLACED_QUESTIONS.includes(q))).toBe(false);
    const pending = first.sections.flatMap((s) => s.lines).filter((l) => l.kind === "pending");
    expect(pending.length).toBeGreaterThan(0);

    const added = answersToText(first.followUps!, { surface: "12", gravats: "1,5", fournitures: "fournis par l'entreprise", acces: "accès de plain-pied" });
    const second = await proposeDraft(ctx, { text: `${text}. ${added}` });
    const lines = second.sections.flatMap((s) => s.lines);
    const tiles = lines.find((l) => l.unit === "m²" && /carrelage/i.test(l.label) && !/d[ée]pose/i.test(l.label));
    expect(tiles?.quantity).toBe("12");
    const rubble = lines.find((l) => l.unit === "m³");
    expect(rubble?.quantity).toBe("1,5");
    expect((second.followUps ?? []).map((f) => f.id)).not.toContain("surface");
  });
});
