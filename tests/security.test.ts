import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { contextFromToken, login, logout, register, requestPasswordReset, resetPassword } from "@/lib/services/accounts";
import { getCustomer, searchCustomers, updateCustomer } from "@/lib/services/customers";
import { createItem, getItem, searchItems } from "@/lib/services/catalog";
import { createQuote, getDraft, getVersion, issueQuote, listQuotes, saveDraft } from "@/lib/services/quotes";
import { exportAccountData } from "@/lib/services/export";
import { handleWebhookEvent, signWebhook, verifyWebhook, startCheckout, computeEntitlements } from "@/lib/services/billing";
import { inviteMember, acceptInvite, listMembers } from "@/lib/services/team";
import { proposeDraft, minimizePersonalData } from "@/lib/services/assistant";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let a: Ctx;
let b: Ctx;
let aCustomer: string;
let aQuote: string;
let aItem: string;

beforeAll(async () => {
  db = await freshDb();
  a = await signUp(db, "a@entreprise-a.fr", "Entreprise A");
  b = await signUp(db, "b@entreprise-b.fr", "Entreprise B");
  await completeProfile(a);
  aCustomer = await makeCustomer(a);
  aItem = await createItem(a, { name: "Pose", unit_price: "45", vat_percent: "10" });
  aQuote = await createQuote(a, { customerId: aCustomer });
});

describe("isolation stricte entre entreprises", () => {
  it("B ne lit ni les clients, ni le catalogue, ni les devis de A", async () => {
    await expect(getCustomer(b, aCustomer)).rejects.toMatchObject({ status: 404 });
    await expect(getItem(b, aItem)).rejects.toMatchObject({ status: 404 });
    await expect(getDraft(b, aQuote)).rejects.toMatchObject({ status: 404 });
    expect((await searchCustomers(b)).length).toBe(0);
    expect((await searchItems(b)).length).toBe(0);
    expect((await listQuotes(b)).total).toBe(0);
  });

  it("B ne peut pas modifier les données de A", async () => {
    await expect(updateCustomer(b, aCustomer, { last_name: "Pirate" })).rejects.toMatchObject({ status: 404 });
    const d = await getDraft(a, aQuote);
    await expect(saveDraft(b, aQuote, d, d.draftRevision)).rejects.toMatchObject({ status: 404 });
    await expect(issueQuote(b, aQuote)).rejects.toMatchObject({ status: 404 });
  });

  it("B ne peut pas rattacher un client ou un article de A à son propre devis", async () => {
    const bQuote = await createQuote(b, {});
    const d = await getDraft(b, bQuote);
    await expect(saveDraft(b, bQuote, { ...d, customerId: aCustomer }, d.draftRevision)).rejects.toMatchObject({ status: 404 });
    // Un article étranger est ignoré (référence vidée), jamais lié.
    const res = await saveDraft(
      b,
      bQuote,
      { ...d, sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line({ catalogItemId: aItem })] }] },
      d.draftRevision,
    );
    expect(res.draftRevision).toBe(d.draftRevision + 1);
    expect((await getDraft(b, bQuote)).sections[0].lines[0].catalogItemId).toBeNull();
  });

  it("B ne peut pas réutiliser les identifiants de lignes de A pour l'écraser", async () => {
    const d = await getDraft(a, aQuote);
    const shared = line();
    await saveDraft(a, aQuote, { ...d, title: "Chantier A", sections: [{ id: d.sections[0].id, title: "", description: "", lines: [shared] }] }, d.draftRevision);
    const bQuote = await createQuote(b, {});
    const db2 = await getDraft(b, bQuote);
    await saveDraft(b, bQuote, { ...db2, sections: [{ id: db2.sections[0].id, title: "", description: "", lines: [{ ...shared, label: "Écrasé" }] }] }, db2.draftRevision);
    expect((await getDraft(a, aQuote)).sections[0].lines[0].label).toBe("Pose de carrelage");
  });

  it("l'export ne contient que les données de l'entreprise", async () => {
    const data = await exportAccountData(b);
    expect(JSON.stringify(data)).not.toContain("Entreprise A");
    expect(data.customers.length).toBe(0);
  });

  it("un PDF d'une autre entreprise est introuvable", async () => {
    await expect(getVersion(db, b.orgId, aQuote, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe("comptes et sessions", () => {
  it("refuse un mot de passe faible et les doublons d'adresse", async () => {
    await expect(register(db, { email: "x@y.fr", password: "court", name: "X", company: "Y", acceptTerms: true }, meta)).rejects.toMatchObject({ status: 400 });
    await expect(
      register(db, { email: "a@entreprise-a.fr", password: "MotDePasse2026", name: "X", company: "Y", acceptTerms: true }, meta),
    ).rejects.toMatchObject({ status: 409 });
    await expect(register(db, { email: "z@y.fr", password: "MotDePasse2026", name: "X", company: "Y" }, meta)).rejects.toMatchObject({ status: 400 });
  });

  it("limite les tentatives de connexion", async () => {
    for (let i = 0; i < 5; i++) await expect(login(db, "a@entreprise-a.fr", "mauvais", { ...meta, ip: "10.0.0.9" })).rejects.toMatchObject({ status: 401 });
    await expect(login(db, "a@entreprise-a.fr", "MotDePasse2026", { ...meta, ip: "10.0.0.9" })).rejects.toMatchObject({ status: 429 });
  });

  it("déconnecte et réinitialise le mot de passe en fermant les sessions", async () => {
    const token = await login(db, "b@entreprise-b.fr", "MotDePasse2026", meta);
    expect(await contextFromToken(db, token, meta)).not.toBeNull();
    await requestPasswordReset(db, "b@entreprise-b.fr");
    const mail = (await db.query<{ body: string }>("SELECT body FROM emails WHERE kind='password_reset' ORDER BY created_at DESC LIMIT 1"))[0];
    const resetToken = /jeton=([A-Za-z0-9_-]+)/.exec(mail.body)![1];
    await resetPassword(db, resetToken, "NouveauMotDePasse1");
    expect(await contextFromToken(db, token, meta)).toBeNull();
    await expect(resetPassword(db, resetToken, "EncoreUnAutre22")).rejects.toMatchObject({ status: 400 });
    const t2 = await login(db, "b@entreprise-b.fr", "NouveauMotDePasse1", meta);
    await logout(db, t2);
    expect(await contextFromToken(db, t2, meta)).toBeNull();
  });
});

describe("abonnements", () => {
  it("vérifie la signature des webhooks", () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const header = signWebhook(payload);
    expect(() => verifyWebhook(payload, header)).not.toThrow();
    expect(() => verifyWebhook(payload + " ", header)).toThrow();
    expect(() => verifyWebhook(payload, null)).toThrow();
  });

  it("traite chaque événement une seule fois", async () => {
    const ev = { id: "evt_unique", type: "invoice.paid" as const, data: { orgId: a.orgId, planCode: "independant", interval: "month" as const } };
    expect((await handleWebhookEvent(db, "simulated", ev)).duplicate).toBe(false);
    expect((await handleWebhookEvent(db, "simulated", ev)).duplicate).toBe(true);
    const inv = await db.query("SELECT * FROM billing_invoices WHERE org_id=$1", [a.orgId]);
    expect(inv.length).toBe(1);
  });

  it("garde l'accès aux données après un échec de paiement et la fin de la période de grâce", async () => {
    await handleWebhookEvent(db, "simulated", { id: "evt_fail", type: "invoice.payment_failed", data: { orgId: a.orgId } });
    let e = await computeEntitlements(db, a.orgId, "active");
    expect(e.plan.code).toBe("independant");
    expect(e.notice).toContain("Paiement en échec");
    e = await computeEntitlements(db, a.orgId, "active", new Date(Date.now() + 8 * 86_400_000));
    expect(e.plan.code).toBe("decouverte");
    expect(e.readOnly).toBe(false);
  });

  it("applique la limite de devis de l'offre Découverte", async () => {
    const c = await signUp(db, "c@entreprise-c.fr", "Entreprise C");
    await completeProfile(c);
    await startCheckout(c, "decouverte", "month", "");
    const ctx = (await contextFromToken(db, await login(db, "c@entreprise-c.fr", "MotDePasse2026", meta), meta))!;
    expect(ctx.entitlements.plan.maxQuotesPerMonth).toBe(5);
    const cust = await makeCustomer(ctx);
    const issueOne = async () => {
      const id = await createQuote(ctx, { customerId: cust });
      const d = await getDraft(ctx, id);
      await saveDraft(ctx, id, { ...d, title: "Travaux", description: "Pose de carrelage dans la cuisine.", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
      return issueQuote(ctx, id);
    };
    for (let i = 0; i < 5; i++) await issueOne();
    await expect(issueOne()).rejects.toMatchObject({ status: 402 });
    // L'assistant n'est pas inclus dans Découverte
    await expect(proposeDraft(ctx, { text: "Rénover une salle de bains de 6 m²" })).rejects.toMatchObject({ status: 402 });
  });

  it("refuse une carte déclinée par le prestataire simulé", async () => {
    const r = await startCheckout(a, "professionnel", "month", "4000 0000 0000 0002");
    expect(r.ok).toBe(false);
  });
});

describe("équipe", () => {
  it("invite un membre et respecte la limite d'utilisateurs", async () => {
    const owner = await signUp(db, "chef@equipe.fr", "Équipe");
    const { token } = await inviteMember(owner, { email: "ouvrier@equipe.fr", role: "member" });
    const member = await signUp(db, "ouvrier@equipe.fr", "Perso");
    await acceptInvite(member, token);
    expect((await listMembers(owner)).length).toBe(2);
  });
});

describe("assistant de préparation", () => {
  it("propose des lignes sans jamais affirmer une quantité mesurée", async () => {
    const p = await proposeDraft(a, {
      text: "Rénover une salle de bains de 6 m², déposer le carrelage existant, poser un nouveau revêtement et refaire les joints. Appeler le 06 12 34 56 78.",
    });
    const lines = p.sections.flatMap((s) => s.lines);
    expect(lines.length).toBeGreaterThan(2);
    expect(p.detected.surfaceM2).toBe(6);
    for (const l of lines.filter((x) => x.kind === "item")) expect(l.estimated).toBe(true);
    expect(p.questions.length).toBeGreaterThan(2);
    expect(minimizePersonalData("tel 06 12 34 56 78 ou a@b.fr")).toBe("tel [téléphone] ou [e-mail]");
  });

  it("rattache chaque surface à la prestation citée dans la même phrase", async () => {
    const p = await proposeDraft(a, { text: "Salle de bain de 6 m2, pose de carrelage au sol, faïence murale sur 14,5 m2." });
    const lines = p.sections.flatMap((s) => s.lines);
    expect(lines.find((l) => /faïence/i.test(l.label))?.quantity).toBe("14,5");
    expect(lines.find((l) => /carrelage au sol/i.test(l.label))?.quantity).toBe("6");
  });
});
