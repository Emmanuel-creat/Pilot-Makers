import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { editDistance, fuzzyFilter, fuzzyScore } from "@/lib/fuzzy";
import { isSealed } from "@/lib/secret-box";
import { purgeDeletedAccounts } from "@/lib/services/accounts";
import { createItem, searchItems } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { getOrganization, updateOrganization } from "@/lib/services/organization";
import {
  acceptedCopy,
  createQuote,
  getDraft,
  getVersion,
  issueQuote,
  recordClientView,
  recordResponseManually,
  respondFromLink,
  saveDraft,
  sendQuote,
} from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function issued(extra: Record<string, unknown> = {}) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, extra) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Salle de bain",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "archives@exemple.fr");
  await completeProfile(ctx);
  await updateOrganization(ctx, { email: "contact@carrelage-martin.fr" });
});

describe("coordonnées bancaires chiffrées", () => {
  it("stocke l'IBAN chiffré et le relit en clair", async () => {
    await updateOrganization(ctx, { bank_holder: "Martin Carrelage SARL", bank_iban: "FR76 3000 6000 0112 3456 7890 189", bank_bic: "AGRIFRPP" });
    const raw = await db.query<{ bank_iban: string; bank_bic: string; bank_holder: string }>(
      "SELECT bank_iban, bank_bic, bank_holder FROM organizations WHERE id=$1",
      [ctx.orgId],
    );
    expect(isSealed(raw[0].bank_iban)).toBe(true);
    expect(isSealed(raw[0].bank_bic)).toBe(true);
    expect(raw[0].bank_iban).not.toContain("3000");
    const org = await getOrganization(ctx);
    expect(org.bank_iban).toBe("FR7630006000011234567890189");
    // Une nouvelle sauvegarde de la même valeur ne crée pas de modification fantôme
    expect((await updateOrganization(ctx, { bank_iban: "FR7630006000011234567890189" })).changed).toBe(0);
  });
});

describe("archive non modifiable", () => {
  it("refuse toute modification ou suppression d'une version émise ou d'une facture, même en base", async () => {
    const id = await issued();
    await expect(db.query("UPDATE quote_versions SET total_ttc_cents=1 WHERE quote_id=$1", [id])).rejects.toThrow(/archivée/);
    await expect(db.query("UPDATE quote_versions SET snapshot='{}'::jsonb WHERE quote_id=$1", [id])).rejects.toThrow(/archivée/);
    await expect(db.query("DELETE FROM quote_versions WHERE quote_id=$1", [id])).rejects.toThrow(/archivée/);
    expect((await getVersion(db, ctx.orgId, id, 1)).snapshot.calc.totalHtCents).toBe(90000);
  });

  it("laisse la purge d'un compte supprimé effacer ses archives", async () => {
    const solo = await signUp(db, "solo-archives@exemple.fr", "Solo");
    await completeProfile(solo);
    const id = await createQuote(solo, { customerId: await makeCustomer(solo) });
    const d = await getDraft(solo, id);
    await saveDraft(
      solo,
      id,
      {
        ...d,
        title: "x",
        site: { line1: "1 rue", line2: "", postalCode: "69002", city: "Lyon" },
        paymentTerms: "x",
        sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(solo, id);
    await db.query("UPDATE users SET status='deletion_pending', deletion_requested_at=now() - interval '40 days' WHERE id=$1", [solo.userId]);
    await purgeDeletedAccounts(db);
    expect(await db.query("SELECT 1 FROM quote_versions WHERE quote_id=$1", [id])).toHaveLength(0);
    // La protection reste active hors de la purge
    const other = await issued();
    await expect(db.query("DELETE FROM quote_versions WHERE quote_id=$1", [other])).rejects.toThrow(/archivée/);
  });
});

describe("médiateur de la consommation", () => {
  it("avertit tant qu'il manque, puis l'imprime sur les devis aux particuliers", async () => {
    const before = await issued();
    const s1 = (await getVersion(db, ctx.orgId, before, 1)).snapshot;
    expect(s1.warnings.join(" ")).toMatch(/médiateur/);
    await updateOrganization(ctx, { mediator_name: "Médiation de la consommation du bâtiment (exemple)", mediator_url: "www.mediateur-exemple.fr" });
    const after = await issued();
    const s2 = (await getVersion(db, ctx.orgId, after, 1)).snapshot;
    expect(s2.mentions.join(" ")).toMatch(
      /médiateur de la consommation : Médiation de la consommation du bâtiment \(exemple\), www\.mediateur-exemple\.fr/,
    );
    const pro = await issued({ type: "entreprise", company_name: "Boulangerie", siren: "552100554" });
    expect((await getVersion(db, ctx.orgId, pro, 1)).snapshot.mentions.join(" ")).not.toMatch(/médiateur/);
  });
});

describe("exemplaire accepté et notifications", () => {
  it("prévient l'artisan à la première ouverture, puis produit un exemplaire accepté avec nom et date", async () => {
    const id = await issued();
    const sent = await sendQuote(ctx, id, { to: "claire@exemple.fr", subject: "Devis", body: "{lien}" });
    const token = sent.link!.split("/d/")[1];
    await expect(acceptedCopy(db, ctx.orgId, id)).rejects.toMatchObject({ status: 409 });
    await recordClientView(db, token, meta);
    await recordClientView(db, token, meta);
    const notes = await db.query<{ subject: string }>(
      "SELECT subject FROM emails WHERE quote_id=$1 AND kind='notification' AND subject LIKE '%consulté%'",
      [id],
    );
    expect(notes).toHaveLength(1);

    await respondFromLink(db, token, { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true }, meta);
    const copy = await acceptedCopy(db, ctx.orgId, id);
    const original = (await getVersion(db, ctx.orgId, id, 1)).pdf;
    expect(Buffer.from(copy.pdf).equals(Buffer.from(original))).toBe(false);
    expect((await PDFDocument.load(copy.pdf)).getPageCount()).toBe((await PDFDocument.load(original)).getPageCount());
    // Recalculé à l'identique à chaque demande
    expect(Buffer.from((await acceptedCopy(db, ctx.orgId, id)).pdf).equals(Buffer.from(copy.pdf))).toBe(true);
  });

  it("produit aussi un exemplaire pour une acceptation enregistrée par l'entreprise", async () => {
    const id = await issued();
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé remis en main propre" });
    expect((await acceptedCopy(db, ctx.orgId, id)).number).toMatch(/^D-/);
  });
});

describe("recherche tolérante aux fautes", () => {
  it("ignore accents et majuscules et accepte une faute par mot", () => {
    expect(editDistance("carrelage", "carelage")).toBe(1);
    expect(editDistance("faience", "faeince")).toBe(1);
    expect(fuzzyScore("ragreage", "Ragréage du sol")).toBeGreaterThan(0);
    expect(fuzzyScore("carelage sol", "Pose de carrelage au sol")).toBeGreaterThan(0);
    expect(fuzzyScore("plomberie", "Pose de carrelage au sol")).toBe(0);
    const list = ["Pose de faïence murale", "Pose de carrelage au sol", "Dépose de carrelage existant"];
    expect(fuzzyFilter(list, "carrelage sol", (x) => x)[0]).toBe("Pose de carrelage au sol");
  });

  it("trouve une prestation du catalogue malgré une faute de frappe", async () => {
    await createItem(ctx, { name: "Pose de faïence murale", unit: "m²", unit_price: "48", vat_percent: "10" });
    const found = await searchItems(ctx, { q: "faiance" });
    expect(found.map((i) => i.name)).toContain("Pose de faïence murale");
  });
});
