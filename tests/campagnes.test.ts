import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { readFilters, render, unknownFields } from "@/lib/campaigns";
import { audience, getCampaign, previewCampaign, saveCampaign, sendCampaign, unsubscribe, unsubscribeInfo } from "@/lib/services/campaigns";
import type { Ctx } from "@/lib/services/context";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

describe("modèles et ciblage", () => {
  it("fusionne les champs et repère les inconnus", () => {
    const v = { prenom: "", nom: "Durand", entreprise: "Carrelage Martin", derniers_travaux: "la salle de bains" };
    expect(render("Bonjour {prenom},\nTravaux : {derniers_travaux} \n{entreprise}", v)).toBe("Bonjour,\nTravaux : la salle de bains\nCarrelage Martin");
    expect(unknownFields("Bonjour {prenom} {ville} {ville}")).toEqual(["ville"]);
    expect(readFilters({ monthsMin: "11", monthsMax: "", type: "pirate", postalPrefix: "69 1", tag: " Fidèle " })).toEqual({
      monthsMin: 11,
      monthsMax: null,
      type: "",
      tag: "Fidèle",
      postalPrefix: "691",
    });
  });
});

describe("campagne vers les anciens clients", () => {
  let db: Database;
  let ctx: Ctx;
  let ancien: string;
  let recent: string;

  async function invoice(customer: string, date: string, title: string) {
    await db.query(
      `INSERT INTO invoices (org_id, customer_id, kind, number, title, issue_date, due_date, snapshot, pdf, pdf_sha256, snapshot_sha256,
         total_ht_cents, total_vat_cents, total_ttc_cents, amount_due_cents)
       VALUES ($1,$2,'final',$3,$4,$5,$5,'{}','\\x00','x','x',100,10,110,110)`,
      [ctx.orgId, customer, `FA-${title}`, title, date],
    );
  }

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "campagne@exemple.fr");
    await completeProfile(ctx);
    ancien = await makeCustomer(ctx, { email: "ancien@exemple.fr", first_name: "Anne" });
    recent = await makeCustomer(ctx, { email: "recent@exemple.fr", first_name: "Rémi" });
    await makeCustomer(ctx, { email: "" });
    await invoice(ancien, "2025-10-02", "Chaudière");
    await invoice(recent, "2026-09-01", "Peinture");
  });

  it("cible d'après la dernière facture", async () => {
    expect((await audience(ctx, readFilters({}), "2026-10-14")).length).toBe(2);
    const old = await audience(ctx, readFilters({ monthsMin: "11", monthsMax: "13" }), "2026-10-14");
    expect(old.map((r) => [r.customerId, r.lastWork, r.lastInvoiceDate])).toEqual([[ancien, "Chaudière", "2025-10-02"]]);
  });

  it("envoie un message personnel une seule fois, puis respecte la désinscription", async () => {
    await expect(saveCampaign(ctx, null, { name: "Test", subject: "Bonjour {ville}", body: "x".repeat(30) })).rejects.toMatchObject({ status: 400 });
    const id = await saveCampaign(ctx, null, {
      name: "Entretien",
      subject: "Votre entretien avec {entreprise}",
      body: "Bonjour {prenom},\n\nNous avons réalisé : {derniers_travaux}. Pensez à l'entretien.",
      monthsMin: "11",
    });
    const p = await previewCampaign(ctx, id);
    expect(p.recipients.map((r) => r.customerId)).toEqual([ancien]);
    expect(p.sample?.body).toContain("Bonjour Anne,");
    expect(p.sample?.body).toContain("Pour ne plus recevoir ses offres");

    expect(await sendCampaign(ctx, id)).toEqual({ recipients: 1, sent: 1 });
    await expect(sendCampaign(ctx, id)).rejects.toMatchObject({ status: 409 });
    expect((await getCampaign(ctx, id)).status).toBe("envoyee");
    const mail = (await db.query<{ body: string; subject: string }>("SELECT subject, body FROM emails WHERE kind='campaign'"))[0];
    expect(mail.subject).toBe("Votre entretien avec Carrelage Martin");
    const token = mail.body.match(/desinscription\/([A-Za-z0-9_-]+)/)![1];

    expect(await unsubscribeInfo(db, token)).toMatchObject({ customerId: ancien, unsubscribed: false });
    await unsubscribe(db, token);
    expect(await unsubscribeInfo(db, token)).toMatchObject({ unsubscribed: true });
    expect(await unsubscribeInfo(db, "inconnu")).toBeNull();
    expect((await audience(ctx, readFilters({}), "2026-10-14")).map((r) => r.customerId)).toEqual([recent]);
  });
});
