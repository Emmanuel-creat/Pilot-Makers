import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { computeQuote } from "@/lib/calc/engine";
import { draftToCalcInput } from "@/lib/calc/draft";
import { alternativeIds, applyVariants, chooseVariants, validVariantChoice, variantGroups } from "@/lib/calc/variants";
import type { Database } from "@/lib/db";
import { one } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import { acceptedCalc, snapshotOptions, snapshotVariants, validChoice } from "@/lib/services/options";
import {
  acceptedCopy,
  createQuote,
  getDraft,
  getVersion,
  issueQuote,
  recordResponseManually,
  respondFromLink,
  saveDraft,
  sendQuote,
} from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

const sec = (id: string, choice: { name: string; label: string } | undefined, lines: { id: string; kind: string; optional?: boolean }[]) => ({
  id,
  ...(choice ? { choice } : {}),
  lines,
});

describe("variantes : règles", () => {
  const sections = [
    sec("prep", undefined, [{ id: "p1", kind: "item", optional: true }]),
    sec("base", { name: "Finitions", label: "Base" }, [
      { id: "b1", kind: "item", optional: true },
      { id: "bn", kind: "note" },
    ]),
    sec("confort", { name: " finitions ", label: "Confort" }, [{ id: "c1", kind: "item" }]),
    sec("seule", { name: "Seule", label: "A" }, [{ id: "s1", kind: "item" }]),
    sec("vide", { name: "", label: "" }, [{ id: "v1", kind: "item" }]),
  ];

  it("regroupe les alternatives d'un même choix, à partir de deux", () => {
    const g = variantGroups(sections);
    expect(g).toHaveLength(1);
    expect(g[0].name).toBe("Finitions");
    expect(g[0].sections.map((s) => s.id)).toEqual(["base", "confort"]);
    expect([...alternativeIds(sections)]).toEqual(["confort"]);
    expect(variantGroups([sec("x", undefined, [])])).toEqual([]);
  });

  it("met hors total les alternatives et compte la première", () => {
    const out = applyVariants(sections);
    expect(out[0].lines[0].optional).toBe(true);
    expect(out[1].lines[0].optional).toBeUndefined();
    expect(out[1].lines[1]).toEqual({ id: "bn", kind: "note" });
    expect(out[2].lines[0].optional).toBe(true);
    expect(out[3]).toBe(sections[3]);
    const plain = [sec("a", undefined, [])];
    expect(applyVariants(plain)).toEqual(plain);
  });

  it("garde la variante choisie, ou la première", () => {
    const flagged = applyVariants(sections);
    const confort = chooseVariants(flagged, ["confort"]);
    expect(confort.map((s) => s.id)).toEqual(["prep", "confort", "seule", "vide"]);
    expect(confort[1].lines[0].optional).toBeUndefined();
    expect(confort[0].lines[0].optional).toBe(true);
    expect(chooseVariants(flagged, []).map((s) => s.id)).toEqual(["prep", "base", "seule", "vide"]);
    expect(chooseVariants([sec("a", undefined, [])], ["a"]).map((s) => s.id)).toEqual(["a"]);
  });

  it("refuse deux variantes du même choix", () => {
    expect(validVariantChoice(sections, ["confort", "autre"])).toEqual(["confort"]);
    expect(validVariantChoice(sections, ["base", "confort"])).toBeNull();
  });

  it("le total du devis compte la première variante", () => {
    const calc = computeQuote(
      draftToCalcInput(
        {
          globalDiscount: "",
          sections: [
            { id: "b", choice: { name: "Douche", label: "Base" }, title: "", description: "", lines: [line({ id: "l1", unitPrice: "40" }) as never] },
            { id: "c", choice: { name: "Douche", label: "Confort" }, title: "", description: "", lines: [line({ id: "l2", unitPrice: "60" }) as never] },
          ],
        },
        false,
      ),
    );
    expect(calc.totalHtCents).toBe(80000);
    expect(calc.sections[1].lines[0].optional).toBe(true);
  });
});

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "variantes@exemple.fr");
  await completeProfile(ctx);
});

/** Salle de bain : préparation 500 € HT, carrelage base 20 m² x 40 € ou confort 20 m² x 60 €, option miroir 100 €. TVA 10 %. */
async function quoteWithVariants() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  const ids = { prep: d.sections[0].id, base: randomUUID(), confort: randomUUID(), premium: randomUUID(), mirror: randomUUID() };
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Salle de bain",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception.",
      sections: [
        {
          id: ids.prep,
          title: "Préparation",
          description: "",
          lines: [
            line({ label: "Dépose", quantity: "1", unit: "forfait", unitPrice: "500" }),
            line({ id: ids.mirror, label: "Miroir", quantity: "1", unit: "u", unitPrice: "100", optional: true }),
          ],
        },
        { id: ids.base, title: "Carrelage", choice: { name: "Finitions", label: "Base" }, description: "", lines: [line({ unitPrice: "40" })] },
        { id: ids.confort, title: "Carrelage", choice: { name: "Finitions", label: "Confort" }, description: "", lines: [line({ unitPrice: "60" })] },
        {
          id: ids.premium,
          title: "Carrelage",
          choice: { name: "Finitions", label: "Premium" },
          description: "Grand format",
          lines: [line({ unitPrice: "90" })],
        },
      ],
    },
    d.draftRevision,
  );
  const saved = await getDraft(ctx, id);
  expect(saved.sections[2].choice).toEqual({ name: "Finitions", label: "Confort" });
  expect(saved.sections[2].lines[0].optional).toBe(true);
  expect(saved.sections[1].lines[0].optional).toBeFalsy();
  await issueQuote(ctx, id);
  return { id, ids };
}

describe("variantes : du devis à la facture", () => {
  it("propose les variantes au client et facture celle qu'il a choisie", async () => {
    const { id, ids } = await quoteWithVariants();
    const v = await getVersion(db, ctx.orgId, id, 1);
    // 500 + 800 HT, TVA 10 % : 1 430 € TTC.
    expect(v.snapshot.calc.totalTtcCents).toBe(143000);
    expect(snapshotOptions(v.snapshot).map((o) => o.label)).toEqual(["Miroir"]);
    const variants = snapshotVariants(v.snapshot);
    expect(variants).toHaveLength(1);
    expect(variants[0].choices.map((c) => [c.label, c.included, c.ttcCents])).toEqual([
      ["Base", true, 88000],
      ["Confort", false, 132000],
      ["Premium", false, 198000],
    ]);
    expect(validChoice(v.snapshot, [ids.confort, ids.premium])).toBeNull();
    expect(validChoice(v.snapshot, [ids.confort, ids.mirror])).toEqual([ids.confort, ids.mirror]);
    expect(acceptedCalc(v.snapshot, [ids.premium]).totalTtcCents).toBe(55000 + 198000);

    const sent = await sendQuote(ctx, id, { to: "claire@exemple.fr", subject: "Devis", body: "{lien}" });
    const token = sent.link!.split("/d/")[1];
    await expect(
      respondFromLink(db, token, { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true, options: [ids.confort, ids.premium] }, meta),
    ).rejects.toMatchObject({ status: 400 });
    await respondFromLink(
      db,
      token,
      { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true, options: [ids.confort, ids.mirror] },
      meta,
    );
    const q = await one<{ total_ttc_cents: unknown }>(db, "SELECT total_ttc_cents FROM quotes WHERE id=$1", [id]);
    // 500 + 1 200 + 100 HT : 1 980 € TTC.
    expect(Number(q!.total_ttc_cents)).toBe(198000);
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    expect(fin.total_ttc_cents).toBe(198000);
    expect(fin.snapshot.sections.map((s) => s.choice?.label ?? s.title)).toEqual(["Préparation", "Confort"]);
    const copy = await acceptedCopy(db, ctx.orgId, id);
    expect(copy.pdf.length).toBeGreaterThan(1000);
  });

  it("garde la première variante si l'acceptation ne précise rien", async () => {
    const { id } = await quoteWithVariants();
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé" });
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    expect(fin.total_ttc_cents).toBe(143000);
    expect(fin.snapshot.sections.map((s) => s.choice?.label ?? s.title)).toEqual(["Préparation", "Base"]);
  });
});
