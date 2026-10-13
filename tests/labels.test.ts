import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { labelsHeadline, labelState, labelTitle, publicLabels, type OrgLabel } from "@/lib/labels";
import { addRge } from "@/lib/services/aids";
import { addLabel, deleteLabel, listLabels, orgPublicLabels, setLabelShown } from "@/lib/services/labels";
import { publicShowcase, updateShowcase } from "@/lib/services/showcase";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const label = (o: Partial<OrgLabel>): OrgLabel => ({ id: "x", kind: "qualibat", name: "", number: "", validUntil: null, shown: true, ...o });

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "labels@exemple.fr");
  await completeProfile(ctx);
});

describe("labels", () => {
  it("donne l'état de validité et le titre", () => {
    expect(labelState(null, "2026-10-13")).toBe("permanent");
    expect(labelState("2026-10-12", "2026-10-13")).toBe("expire");
    expect(labelState("2026-11-30", "2026-10-13")).toBe("a_renouveler");
    expect(labelState("2027-06-30", "2026-10-13")).toBe("valide");
    expect(labelTitle({ kind: "qualibat", name: "2111" })).toBe("Qualibat 2111");
    expect(labelTitle({ kind: "autre", name: " Artisan du patrimoine " })).toBe("Artisan du patrimoine");
  });

  it("ne montre que les labels valides et non masqués, RGE en tête, sans doublon", () => {
    const list = publicLabels(
      [
        { body: "Qualibat", number: "E-12345", domains: ["Isolation des combles et toitures"], valid_until: "2027-03-31" },
        { body: "Qualifelec", number: "Q-1", domains: [], valid_until: "2025-01-01" },
      ],
      [
        label({ kind: "handibat", number: "H 9" }),
        label({ kind: "handibat", number: "h9" }),
        label({ kind: "maitre_artisan", shown: false }),
        label({ kind: "eco_artisan", validUntil: "2026-01-01" }),
        label({ kind: "qualibat", validUntil: "2027-01-31" }),
      ],
      "2026-10-13",
    );
    expect(list.map((l) => l.title)).toEqual(["Qualibat RGE", "Handibat", "Qualibat"]);
    expect(list[0]).toMatchObject({ rge: true, detail: "Isolation des combles et toitures" });
    expect(list[2].detail).toBe("Valable jusqu'au 31/01/2027");
    expect(labelsHeadline(list)).toBe("Entreprise RGE, Handibat et Qualibat");
    expect(labelsHeadline([])).toBe("");
  });
});

describe("labels de l'entreprise", () => {
  it("se saisissent, se masquent et s'affichent sur la vitrine", async () => {
    await expect(addLabel(ctx, { kind: "autre", name: "" })).rejects.toThrow("Indiquez le nom du label");
    await expect(addLabel(ctx, { kind: "inconnu" })).rejects.toThrow("Label inconnu");
    const id = await addLabel(ctx, { kind: "handibat", number: "H-2026-04", validUntil: "" });
    const other = await addLabel(ctx, { kind: "autre", name: "Artisan du patrimoine", validUntil: "2030-12-31" });
    await addRge(ctx, { body: "Qualibat", number: "E-778899", domains: ["isolation_combles"], valid_until: "2030-01-31" });
    expect((await listLabels(ctx)).map((l) => l.kind)).toEqual(["handibat", "autre"]);

    let pub = await orgPublicLabels(db, ctx.orgId, "2026-10-13");
    expect(pub.map((l) => l.title)).toEqual(["Qualibat RGE", "Handibat", "Artisan du patrimoine"]);
    expect(pub[0].detail).toBe("Isolation des combles et toitures");

    await setLabelShown(ctx, other, false);
    pub = await orgPublicLabels(db, ctx.orgId, "2026-10-13");
    expect(pub).toHaveLength(2);

    await updateShowcase(ctx, { enabled: true, slug: "labels-lyon", intro: "", area: "", show_phone: "", show_email: "" });
    const s = await publicShowcase(db, "labels-lyon");
    expect(s?.labels.map((l) => l.title)).toEqual(["Qualibat RGE", "Handibat"]);

    await deleteLabel(ctx, id);
    await expect(deleteLabel(ctx, id)).rejects.toThrow("Label introuvable");
    expect(await listLabels(ctx)).toHaveLength(1);
  });
});
