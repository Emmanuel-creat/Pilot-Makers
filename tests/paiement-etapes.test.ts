import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { canInvoice, canSubmit, currentStage, parsePlan, stageMail } from "@/lib/payment-stages";
import { createPortalLink, openPortal } from "@/lib/services/client-space";
import type { Ctx } from "@/lib/services/context";
import { getInvoice } from "@/lib/services/invoices";
import { decideStage, defineStages, invoiceStage, listStages, stagePhotoForPortal, submitStage } from "@/lib/services/payment-stages";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { freshDb, line, makeCustomer, signUp, completeProfile } from "./helpers";
import { grayPng } from "./png";

let db: Database;
let ctx: Ctx;
let other: Ctx;
const META = { ip: "198.51.100.42" };

async function acceptedQuote() {
  const customerId = await makeCustomer(ctx);
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line({ unitPrice: "45", quantity: "20" })] }] },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return { id, customerId };
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "etapes@exemple.fr");
  await completeProfile(ctx);
  other = await signUp(db, "etapes-autre@exemple.fr");
  await completeProfile(other);
});

describe("plan d'étapes", () => {
  it("valide les avancements cumulés croissants jusqu'à 100 %", () => {
    expect(
      parsePlan([
        { label: "Démolition", percent: "30" },
        { label: "Plomberie", percent: "70 %" },
        { label: "Finitions", percent: "100" },
        { label: "", percent: "" },
      ]),
    ).toEqual({
      plan: [
        { label: "Démolition", cumulativeBp: 3000 },
        { label: "Plomberie", cumulativeBp: 7000 },
        { label: "Finitions", cumulativeBp: 10000 },
      ],
      error: null,
    });
    expect(parsePlan([]).error).toMatch(/au moins une/);
    expect(
      parsePlan([
        { label: "A1", percent: "50" },
        { label: "B1", percent: "40" },
        { label: "C1", percent: "100" },
      ]).error,
    ).toMatch(/Étape 2/);
    expect(parsePlan([{ label: "A1", percent: "50" }]).error).toMatch(/100 %/);
    expect(parsePlan([{ label: "A1", percent: "abc" }]).error).toMatch(/Étape 1/);
    expect(parsePlan([{ label: "A", percent: "100" }]).error).toMatch(/libellé/);
  });

  it("l'étape en cours se soumet, une validée se facture dans l'ordre", () => {
    const st = [
      { id: "a", position: 1, status: "validee" as const, invoiceId: null },
      { id: "b", position: 2, status: "validee" as const, invoiceId: null },
      { id: "c", position: 3, status: "contestee" as const, invoiceId: null },
    ];
    expect(currentStage(st)?.id).toBe("c");
    expect(canSubmit(st, "c")).toBe(true);
    expect(canSubmit(st, "b")).toBe(false);
    expect(canInvoice(st, "a")).toBe(true);
    expect(canInvoice(st, "b")).toBe(false);
    expect(canInvoice(st, "c")).toBe(false);
  });

  it("l'e-mail au client donne le lien et la règle de facturation", () => {
    const m = stageMail({ orgName: "Bâti Lyon", quoteNumber: "D-2026-0001", stageLabel: "Plomberie", percent: "70 %", url: "https://x/espace/t", note: "" });
    expect(m.subject).toBe("Bâti Lyon : étape à valider sur le devis D-2026-0001");
    expect(m.body).toContain("https://x/espace/t");
    expect(m.body).toContain("Seule une étape validée est facturée");
  });
});

describe("parcours complet", () => {
  it("photo, contestation, nouvelle soumission, validation puis facturation", async () => {
    const { id, customerId } = await acceptedQuote();
    await expect(defineStages(ctx, id, [{ label: "Démolition", percent: "40" }])).rejects.toMatchObject({ status: 400 });
    await defineStages(ctx, id, [
      { label: "Démolition", percent: "40" },
      { label: "Finitions", percent: "100" },
    ]);
    let v = await listStages(ctx, id);
    expect(v.stages.map((s) => [s.label, s.cumulativeBp, s.status])).toEqual([
      ["Démolition", 4000, "prevue"],
      ["Finitions", 10000, "prevue"],
    ]);
    const [s1, s2] = v.stages;
    await expect(submitStage(ctx, s2.id, { note: "", notify: false }, [grayPng()])).rejects.toMatchObject({ status: 409 });
    await expect(submitStage(ctx, s1.id, { note: "", notify: false }, [])).rejects.toMatchObject({ status: 400 });
    await expect(submitStage(ctx, s1.id, { note: "", notify: false }, [new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2])])).rejects.toMatchObject({
      status: 400,
    });
    const sent = await submitStage(ctx, s1.id, { note: "Cloisons déposées", notify: true }, [grayPng(), grayPng(32, 32)]);
    expect(sent.emailed).toBe(true);
    await expect(defineStages(ctx, id, [{ label: "Tout", percent: "100" }])).rejects.toMatchObject({ status: 409 });
    await expect(invoiceStage(ctx, s1.id)).rejects.toMatchObject({ status: 409 });

    const { token } = await createPortalLink(ctx, customerId);
    let p = (await openPortal(db, token, META))!;
    const stages = p.quotes.find((q) => q.id === id)!.stages;
    expect(stages.map((s) => s.status)).toEqual(["soumise", "prevue"]);
    expect(stages[0].photoIds).toHaveLength(2);
    expect((await stagePhotoForPortal(db, token, stages[0].photoIds[0], META)).type).toBe("image/png");

    await expect(decideStage(db, token, s1.id, { decision: "contestee", comment: "" }, META)).rejects.toMatchObject({ status: 400 });
    expect(await decideStage(db, token, s1.id, { decision: "contestee", comment: "Gravats encore dans le jardin" }, META)).toBe("contestee");
    await expect(decideStage(db, token, s1.id, { decision: "validee" }, META)).rejects.toMatchObject({ status: 409 });
    v = await listStages(ctx, id);
    expect(v.stages[0].clientComment).toBe("Gravats encore dans le jardin");
    expect(v.stages[0].canSubmit).toBe(true);

    await submitStage(ctx, s1.id, { note: "Jardin nettoyé", notify: false }, [grayPng()]);
    expect((await listStages(ctx, id)).stages[0].photoIds).toHaveLength(1);
    expect(await decideStage(db, token, s1.id, { decision: "validee" }, META)).toBe("validee");

    const inv = await invoiceStage(ctx, s1.id);
    expect((await getInvoice(ctx, inv.id)).kind).toBe("progress");
    await expect(invoiceStage(ctx, s1.id)).rejects.toMatchObject({ status: 409 });

    await submitStage(ctx, s2.id, { note: "", notify: false }, [grayPng()]);
    await decideStage(db, token, s2.id, { decision: "validee" }, META);
    const last = await invoiceStage(ctx, s2.id);
    expect((await getInvoice(ctx, last.id)).kind).toBe("final");
    p = (await openPortal(db, token, META))!;
    expect(p.quotes.find((q) => q.id === id)!.stages.every((s) => s.invoiceNumber)).toBe(true);
  });

  it("refuse un devis non accepté et cloisonne les entreprises et les clients", async () => {
    const draft = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await expect(defineStages(ctx, draft, [{ label: "Tout", percent: "100" }])).rejects.toMatchObject({ status: 409 });
    const { id } = await acceptedQuote();
    await defineStages(ctx, id, [{ label: "Tout le chantier", percent: "100" }]);
    const [st] = (await listStages(ctx, id)).stages;
    await expect(listStages(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(submitStage(other, st.id, { note: "", notify: false }, [grayPng()])).rejects.toMatchObject({ status: 404 });
    await submitStage(ctx, st.id, { note: "", notify: false }, [grayPng()]);
    const stranger = await makeCustomer(ctx);
    const { token } = await createPortalLink(ctx, stranger);
    await expect(decideStage(db, token, st.id, { decision: "validee" }, META)).rejects.toMatchObject({ status: 404 });
  });
});
