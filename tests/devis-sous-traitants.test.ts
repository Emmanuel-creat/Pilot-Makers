import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { createSubcontractor } from "@/lib/services/subcontractors";
import {
  answerSubQuote,
  decideSubQuote,
  integrateSubQuote,
  listSubQuotes,
  parseMarginBp,
  publicSubQuote,
  recordSubQuote,
  requestSubQuote,
  salePriceCents,
  subQuoteFile,
} from "@/lib/services/subcontractor-quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let quoteId: string;
let elec: string;
let plomb: string;
const META = { ip: "203.0.113.9" };
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
const tokenOf = (url: string) => new URL(url).pathname.split("/").pop()!;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "st-devis@exemple.fr");
  await completeProfile(ctx);
  quoteId = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, quoteId);
  await saveDraft(ctx, quoteId, { ...d, title: "Rénovation cuisine", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  elec = await createSubcontractor(ctx, { name: "Élec Services", email: "elec@exemple.fr", contactName: "Paul" });
  plomb = await createSubcontractor(ctx, { name: "Plomberie Martin" });
});

describe("devis des sous-traitants", () => {
  it("calcul de la marge", () => {
    expect(parseMarginBp("15")).toBe(1500);
    expect(parseMarginBp("12,5 %")).toBe(1250);
    expect(parseMarginBp("")).toBe(0);
    expect(() => parseMarginBp("-3")).toThrow();
    expect(() => parseMarginBp("400")).toThrow();
    expect(salePriceCents(120_000, 1500)).toBe(138_000);
  });

  it("demande envoyée, réponse en ligne du sous-traitant, intégration au devis client", async () => {
    const r = await requestSubQuote(ctx, {
      subcontractorId: elec,
      quoteId,
      title: "Mise aux normes du tableau électrique",
      description: "Cuisine 12 m²",
    });
    expect(r.emailed).toBe(true);
    const mail = await db.query<{ to_address: string; body: string }>("SELECT to_address, body FROM emails WHERE kind='subcontractor_quote'");
    expect(mail[0].to_address).toBe("elec@exemple.fr");
    expect(mail[0].body).toContain(r.url);
    const token = tokenOf(r.url);

    const view = (await publicSubQuote(db, token, META))!;
    expect(view).toMatchObject({ title: "Mise aux normes du tableau électrique", canAnswer: true, answer: null, subcontractorName: "Élec Services" });
    await expect(answerSubQuote(db, token, { amount: "0" }, null, "", META)).rejects.toMatchObject({ status: 400 });
    await expect(answerSubQuote(db, token, { amount: "1200" }, new Uint8Array([1, 2, 3]), "x.bin", META)).rejects.toMatchObject({ status: 400 });
    await answerSubQuote(db, token, { amount: "1 200,00", delay: "2 jours", name: "Paul" }, PDF, "devis-elec.pdf", META);
    expect((await publicSubQuote(db, token, META))!.answer).toMatchObject({ amountCents: 120_000, delay: "2 jours", hasFile: true });
    const notif = await db.query<{ subject: string }>("SELECT subject FROM emails WHERE kind='notification'");
    expect(notif.at(-1)!.subject).toContain("Élec Services a répondu");
    expect((await subQuoteFile(ctx, r.id)).type).toBe("application/pdf");

    await integrateSubQuote(ctx, r.id, { margin: "15" });
    const d = await getDraft(ctx, quoteId);
    const added = d.sections.at(-1)!.lines.at(-1)!;
    expect(added).toMatchObject({
      nature: "sous_traitance",
      label: "Mise aux normes du tableau électrique",
      quantity: "1",
      unitPrice: "1380,00",
      unitCost: "1200,00",
    });
    expect((await listSubQuotes(ctx, { quoteId }))[0]).toMatchObject({ status: "retenu", margin_bp: 1500 });
    // La demande retenue est close : le sous-traitant ne peut plus modifier son prix.
    await expect(answerSubQuote(db, token, { amount: "900" }, null, "", META)).rejects.toMatchObject({ status: 409 });
    await expect(integrateSubQuote(ctx, r.id, { margin: "15" })).rejects.toMatchObject({ status: 409 });
  });

  it("prix reçu par téléphone, demande annulée, devis émis non modifiable", async () => {
    const a = await requestSubQuote(ctx, { subcontractorId: plomb, quoteId, title: "Déplacement de l'évier" });
    expect(a.emailed).toBe(false);
    const b = await requestSubQuote(ctx, { subcontractorId: plomb, title: "Réseau d'évacuation", send: false });
    await recordSubQuote(ctx, a.id, { amount: "450", delay: "1 jour" });
    await expect(decideSubQuote(ctx, b.id, "refuse")).rejects.toMatchObject({ status: 409 });
    await decideSubQuote(ctx, b.id, "annule");
    expect(await publicSubQuote(db, tokenOf(b.url), META)).toBeNull();
    await expect(integrateSubQuote(ctx, b.id, { quoteId })).rejects.toMatchObject({ status: 409 });
    expect((await listSubQuotes(ctx, { subcontractorId: plomb })).map((x) => x.status).sort()).toEqual(["annule", "recu"]);

    await issueQuote(ctx, quoteId);
    await expect(integrateSubQuote(ctx, a.id, { margin: "10" })).rejects.toMatchObject({ status: 409 });
    await decideSubQuote(ctx, a.id, "refuse");
  });

  it("une autre entreprise ne voit rien", async () => {
    const other = await signUp(db, "autre-st@exemple.fr");
    expect(await listSubQuotes(other)).toEqual([]);
    const [first] = await listSubQuotes(ctx, { subcontractorId: elec });
    await expect(subQuoteFile(other, first.id)).rejects.toMatchObject({ status: 404 });
    await expect(requestSubQuote(other, { subcontractorId: elec, title: "Essai" })).rejects.toMatchObject({ status: 404 });
  });
});
