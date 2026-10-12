import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  compareVersions,
  createQuote,
  createRevision,
  getDraft,
  getVersion,
  issueQuote,
  listQuotes,
  previewQuote,
  recordClientView,
  respondFromLink,
  saveDraft,
  sendQuote,
  verifyVersion,
  duplicateQuote,
  deleteDraft,
} from "@/lib/services/quotes";
import { getCustomer, updateCustomer } from "@/lib/services/customers";
import { updateOrganization } from "@/lib/services/organization";
import { sha256 } from "@/lib/security";
import { checkCompliance } from "@/lib/services/compliance";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let customerId: string;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "paul@martin.fr");
  await completeProfile(ctx);
  customerId = await makeCustomer(ctx);
});

async function draftWith(lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) {
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  const res = await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Rénovation salle de bains",
      description: "Dépose de l'ancien carrelage et pose d'un nouveau revêtement de sol.",
      sections: [{ id: d.sections[0].id, title: "Pose", description: "", lines }],
      ...extra,
    },
    d.draftRevision,
  );
  return { id, revision: res.draftRevision, res };
}

describe("cycle de vie d'un devis", () => {
  it("calcule et enregistre un brouillon", async () => {
    const { res } = await draftWith([line()]);
    expect(res.status).toBe("draft");
    expect(res.calc.totalTtcCents).toBe(99000);
  });

  it("refuse un enregistrement concurrent (aucune perte silencieuse)", async () => {
    const { id, revision } = await draftWith([line()]);
    const d = await getDraft(ctx, id);
    await expect(saveDraft(ctx, id, d, revision - 1)).rejects.toMatchObject({ status: 409 });
  });

  it("marque « à compléter » un devis avec une ligne non chiffrée", async () => {
    const { res } = await draftWith([line(), line({ kind: "pending", label: "Évacuation", quantity: "", unitPrice: "" })]);
    expect(res.status).toBe("incomplete");
  });

  it("bloque l'émission tant que des informations obligatoires manquent", async () => {
    const id = await createQuote(ctx, {});
    const p = await previewQuote(ctx, id);
    expect(p.canIssue).toBe(false);
    const codes = p.issues.filter((i) => i.blocking).map((i) => i.code);
    expect(codes).toContain("customer");
    expect(codes).toContain("title");
    await expect(issueQuote(ctx, id)).rejects.toMatchObject({ status: 422 });
  });

  it("émet une version figée avec PDF et empreinte, puis l'envoie, la fait consulter et accepter", async () => {
    const { id } = await draftWith([line(), line({ label: "Joints", quantity: "20", unitPrice: "14", unitCost: "5" })]);
    const issued = await issueQuote(ctx, id);
    expect(issued.version).toBe(1);
    expect(issued.number).toMatch(/^D-\d{4}-0001$/);

    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(Buffer.from(v.pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect(sha256(v.pdf)).toBe(v.pdfSha256);
    expect(v.snapshot.calc.totalHtCents).toBe(90000 + 28000);
    expect((await verifyVersion(ctx, id, 1)).snapshotOk).toBe(true);

    // Le brouillon n'est plus modifiable directement
    const d = await getDraft(ctx, id);
    await expect(saveDraft(ctx, id, d, d.draftRevision)).rejects.toMatchObject({ status: 409 });

    const sent = await sendQuote(ctx, id, {
      to: "claire@exemple.fr",
      subject: "Votre devis",
      body: "Bonjour, voici le devis : {lien}",
      idempotencyKey: "k1",
    });
    expect(sent.status).toBe("sent");
    const again = await sendQuote(ctx, id, { to: "claire@exemple.fr", subject: "Votre devis", body: "Bonjour", idempotencyKey: "k1" });
    expect(again.duplicate).toBe(true);
    const token = sent.link!.split("/d/")[1];

    const viewed = await recordClientView(db, token, meta);
    expect(viewed?.canRespond).toBe(true);
    expect((await getDraft(ctx, id)).status).toBe("viewed");

    await expect(respondFromLink(db, token, { decision: "accept", name: "Claire Dubois" }, meta)).rejects.toMatchObject({ status: 400 });
    // TVA à 10 % : la cliente doit attester les conditions du taux réduit
    await expect(respondFromLink(db, token, { decision: "accept", name: "Claire Dubois", consent: true }, meta)).rejects.toMatchObject({
      status: 400,
    });
    const res = await respondFromLink(
      db,
      token,
      { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true, earlyStart: true },
      meta,
    );
    expect(res.status).toBe("accepted");
    const proof = await db.query<{ data: Record<string, unknown> }>("SELECT data FROM document_events WHERE quote_id=$1 AND type='accepted'", [id]);
    expect(String(proof[0].data.vat_attestation)).toMatch(/achevés depuis plus de deux ans/);
    expect(proof[0].data.withdrawal_period).toBe(true);
    expect(proof[0].data.early_start_requested).toBe(true);
    const after = await getDraft(ctx, id);
    expect(after.acceptedVersion).toBe(1);

    // Une version acceptée ne peut pas être modifiée silencieusement
    await expect(createRevision(ctx, id)).rejects.toMatchObject({ status: 409 });
    await expect(respondFromLink(db, token, { decision: "refuse", name: "X Y" }, meta)).rejects.toMatchObject({ status: 409 });
  });

  it("crée une nouvelle version, invalide l'ancien lien et compare les versions", async () => {
    const { id } = await draftWith([line()]);
    await issueQuote(ctx, id);
    const sent = await sendQuote(ctx, id, { to: "claire@exemple.fr", subject: "Devis", body: "{lien}" });
    const oldToken = sent.link!.split("/d/")[1];
    await createRevision(ctx, id);
    const d = await getDraft(ctx, id);
    expect(d.status).toBe("draft");
    d.sections[0].lines[0].quantity = "25";
    d.sections[0].lines.push(line({ label: "Plinthes", quantity: "12", unit: "ml", unitPrice: "12" }) as never);
    await saveDraft(ctx, id, d, d.draftRevision);
    const v2 = await issueQuote(ctx, id);
    expect(v2.version).toBe(2);
    const v1 = await getVersion(db, ctx.orgId, id, 1);
    expect(v1.snapshot.calc.totalHtCents).toBe(90000); // la version 1 reste intacte

    const diff = await compareVersions(ctx, id, 1, 2);
    expect(diff.lines.find((l) => l.status === "added")?.label).toBe("Plinthes");
    expect(diff.lines.find((l) => l.status === "changed")?.changes[0]).toContain("quantité");

    const old = await recordClientView(db, oldToken, meta);
    expect(old?.canRespond).toBe(false);
    await expect(
      respondFromLink(db, oldToken, { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true }, meta),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("conserve les coordonnées historiques après modification du client et du profil", async () => {
    const { id } = await draftWith([line()]);
    await issueQuote(ctx, id);
    const c = await getCustomer(ctx, customerId);
    await updateCustomer(ctx, customerId, { ...c, billing_line1: "99 avenue Nouvelle", tags: c.tags });
    await updateOrganization(ctx, { trade_name: "Nouveau Nom" });
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.customer.billing_line1).toBe("4 place Bellecour");
    expect(v.snapshot.org.trade_name).toBe("Carrelage Martin");
    await updateOrganization(ctx, { trade_name: "Carrelage Martin" });
  });

  it("ne met jamais le coût interne dans le snapshot imprimé du client", async () => {
    const { id } = await draftWith([line({ unitCost: "31,17" })]);
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    // Le coût est conservé pour la marge interne, mais le PDF (texte encodé) ne le contient pas.
    const pdfText = Buffer.from(v.pdf).toString("latin1");
    expect(pdfText).not.toContain("31,17");
    expect(v.snapshot.calc.margin.costCents).toBe(62340);
  });

  it("duplique un devis et supprime uniquement les brouillons jamais émis", async () => {
    const { id } = await draftWith([line()]);
    const copy = await duplicateQuote(ctx, id);
    const d = await getDraft(ctx, copy);
    expect(d.title).toContain("(copie)");
    expect(d.sections[0].lines[0].id).not.toBe((await getDraft(ctx, id)).sections[0].lines[0].id);
    await deleteDraft(ctx, copy);
    await issueQuote(ctx, id);
    await expect(deleteDraft(ctx, id)).rejects.toMatchObject({ status: 409 });
  });

  it("liste et filtre les devis", async () => {
    const all = await listQuotes(ctx, {});
    expect(all.total).toBeGreaterThan(3);
    const accepted = await listQuotes(ctx, { status: "accepted" });
    expect(accepted.items.every((q) => q.status === "accepted")).toBe(true);
    const search = await listQuotes(ctx, { q: "salle de bains" });
    expect(search.total).toBeGreaterThan(0);
  });

  it("refuse les identifiants de ligne invalides", async () => {
    const id = await createQuote(ctx, { customerId });
    const d = await getDraft(ctx, id);
    await expect(
      saveDraft(
        ctx,
        id,
        { ...d, sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line({ id: "pas-un-uuid" })] }] },
        d.draftRevision,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const dupId = randomUUID();
    await expect(
      saveDraft(
        ctx,
        id,
        { ...d, sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line({ id: dupId }), line({ id: dupId })] }] },
        d.draftRevision,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("protection du client consommateur", () => {
  it("joint le droit de rétractation et l'attestation de TVA réduite selon le client et le lieu de signature", async () => {
    const { id } = await draftWith([line(), line({ label: "Isolation", vatPercent: "5,5" })]);
    const v = await issueQuote(ctx, id);
    const snap = (await getVersion(db, ctx.orgId, id, v.version)).snapshot;
    expect(snap.consumer).toEqual({ withdrawal: true, reducedVatBp: [550, 1000] });

    // Signé dans les locaux de l'entreprise : pas de rétractation, mais toujours l'attestation
    const second = await draftWith([line()]);
    const d = await getDraft(ctx, second.id);
    await saveDraft(ctx, second.id, { ...d, contractPlace: "etablissement" }, d.draftRevision);
    expect((await getDraft(ctx, second.id)).contractPlace).toBe("etablissement");
    const v2 = await issueQuote(ctx, second.id);
    expect((await getVersion(db, ctx.orgId, second.id, v2.version)).snapshot.consumer).toEqual({ withdrawal: false, reducedVatBp: [1000] });
  });

  it("ajoute une page de formulaire de rétractation au PDF", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const pages = async (place: string) => {
      const { id } = await draftWith([line()]);
      const d = await getDraft(ctx, id);
      await saveDraft(ctx, id, { ...d, contractPlace: place }, d.draftRevision);
      await issueQuote(ctx, id);
      return (await PDFDocument.load((await getVersion(db, ctx.orgId, id, 1)).pdf)).getPageCount();
    };
    expect(await pages("hors_etablissement")).toBe((await pages("etablissement")) + 1);
  });

  it("signale qu'aucun acompte ne peut être encaissé avant sept jours hors établissement", () => {
    const org = {
      trade_name: "A",
      legal_name: "",
      address_line1: "1 rue",
      postal_code: "69002",
      city: "Lyon",
      siren: "",
      siret: "73282932000074",
      vat_number: "FR1",
      vat_regime: "normal" as const,
      phone: "0",
      email: "",
      insurance_decennale: false,
      insurance_name: "",
      insurance_policy: "",
      insurance_area: "",
      insurance_coverage: "",
      hourly_rate: "",
      travel_fee: "",
      trade: "",
    };
    const codes = (place: string, deposit: string) =>
      checkCompliance({
        org,
        customer: { type: "particulier", name: "Claire", billing_line1: "1 rue", billing_postal_code: "69002", billing_city: "Lyon", siren: "" },
        quote: {
          title: "x",
          description: "",
          site_line1: "",
          site_postal_code: "",
          site_city: "",
          validity_days: 30,
          payment_terms: "x",
          deposit_percent: deposit,
          contract_place: place,
        },
        lines: [],
        calc: { issues: [], vatGroups: [], margin: { linesWithoutCost: 0 } } as never,
      }).map((i) => i.code);
    expect(codes("auto", "30")).toContain("withdrawal_deposit");
    expect(codes("auto", "0")).not.toContain("withdrawal_deposit");
    expect(codes("etablissement", "30")).not.toContain("withdrawal_deposit");
  });
});
