import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { hmacSha256 } from "@/lib/security";
import type { Ctx } from "@/lib/services/context";
import { createCustomer } from "@/lib/services/customers";
import { createFinalInvoice, getInvoice, recordPayment } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import {
  checkWebhookUrl,
  createEndpoint,
  deliverWebhooks,
  listDeliveries,
  retryDelayMs,
  sendTestWebhook,
  setEndpointActive,
  listEndpoints,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_MAX_ENDPOINTS,
} from "@/lib/services/webhooks";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

type Sent = { url: string; headers: Record<string, string>; body: string };

function recorder(status = 200) {
  const sent: Sent[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response("ok", { status });
  };
  return { sent, fetchImpl };
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "webhooks@exemple.fr");
  await completeProfile(ctx);
});

describe("webhooks", () => {
  it("refuse les adresses non publiques ou non chiffrées", () => {
    expect(checkWebhookUrl("https://hooks.exemple.fr/recevoir#x")).toBe("https://hooks.exemple.fr/recevoir");
    for (const bad of [
      "http://hooks.exemple.fr/",
      "https://localhost/a",
      "https://127.0.0.1/a",
      "https://10.0.0.5/a",
      "https://192.168.1.2/",
      "https://169.254.169.254/latest",
      "https://[::1]/",
      "https://serveur.local/",
      "https://intranet/",
      "https://user:pass@hooks.exemple.fr/",
      "https://hooks.exemple.fr:8443/",
    ]) {
      expect(() => checkWebhookUrl(bad), bad).toThrow();
    }
  });

  it("signe chaque envoi et couvre client créé, devis signé, facture payée", async () => {
    const { secret } = await createEndpoint(ctx, {
      url: "https://hooks.exemple.fr/pm",
      events: ["customer.created", "quote.accepted", "invoice.paid"],
    });
    expect(secret).toMatch(/^whsec_/);
    const customer = await createCustomer(ctx, { type: "particulier", last_name: "Durand", email: "durand@exemple.fr" }, { allowDuplicate: true });
    const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, qid);
    await saveDraft(
      ctx,
      qid,
      {
        ...d,
        title: "Cuisine",
        site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [{ ...d.sections[0], lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, qid);
    await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const inv = await createFinalInvoice(ctx, qid);
    const rows = await getInvoice(ctx, inv.id);
    await recordPayment(ctx, inv.id, {
      amount: (rows.amount_due_cents / 100).toFixed(2).replace(".", ","),
      paidOn: "2026-10-01",
      method: "virement",
    });

    const { sent, fetchImpl } = recorder();
    expect(await deliverWebhooks(db, { fetchImpl })).toEqual({ delivered: 4, failed: 0 });
    const types = sent.map((s) => JSON.parse(s.body).type);
    expect(types.sort()).toEqual(["customer.created", "customer.created", "invoice.paid", "quote.accepted"]);
    for (const s of sent) {
      const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(s.headers["pilot-makers-signature"])!;
      expect(m).toBeTruthy();
      expect(m[2]).toBe(hmacSha256(secret, `${m[1]}.${s.body}`));
      expect(JSON.parse(s.body).id).toBe(s.headers["pilot-makers-delivery"]);
    }
    const created = sent.map((s) => JSON.parse(s.body)).find((b) => b.type === "customer.created" && b.data.customer_id === customer.id);
    expect(created.data.name).toContain("Durand");
    const paid = sent.map((s) => JSON.parse(s.body)).find((b) => b.type === "invoice.paid");
    expect(paid.data).toMatchObject({ invoice_id: inv.id, paid_cents: rows.amount_due_cents });
    // Déjà envoyés : rien de plus.
    expect(await deliverWebhooks(db, { fetchImpl })).toEqual({ delivered: 0, failed: 0 });
  });

  it("nouveaux essais espacés puis abandon, adresse suspendue, test immédiat", async () => {
    const other = await signUp(db, "webhooks-echec@exemple.fr", "Plomberie Echec");
    const { id } = await createEndpoint(other, { url: "https://hooks.exemple.fr/echec", events: ["customer.created"] });
    await createCustomer(other, { type: "particulier", last_name: "Martin" }, { allowDuplicate: true });
    const failing = recorder(500);
    let now = new Date();
    for (let i = 1; i <= WEBHOOK_MAX_ATTEMPTS; i++) {
      expect(await deliverWebhooks(db, { now, fetchImpl: failing.fetchImpl, orgId: other.orgId })).toEqual({ delivered: 0, failed: 1 });
      // Trop tôt pour le prochain essai.
      expect(await deliverWebhooks(db, { now: new Date(now.getTime() + 1000), fetchImpl: failing.fetchImpl, orgId: other.orgId })).toEqual({
        delivered: 0,
        failed: 0,
      });
      now = new Date(now.getTime() + retryDelayMs(i) + 1000);
    }
    expect(await deliverWebhooks(db, { now, fetchImpl: failing.fetchImpl, orgId: other.orgId })).toEqual({ delivered: 0, failed: 0 });
    const [last] = await listDeliveries(other);
    expect(last).toMatchObject({ attempts: WEBHOOK_MAX_ATTEMPTS, last_status: 500 });
    expect(last.failed_at).not.toBeNull();

    await setEndpointActive(other, id, false);
    await createCustomer(other, { type: "particulier", last_name: "Bernard" }, { allowDuplicate: true });
    expect(await deliverWebhooks(db, { now, fetchImpl: failing.fetchImpl, orgId: other.orgId })).toEqual({ delivered: 0, failed: 0 });

    const ok = recorder();
    expect(await sendTestWebhook(other, id, ok.fetchImpl)).toEqual({ delivered: 1, failed: 0 });
    expect(JSON.parse(ok.sent[0].body).type).toBe("ping");
  });

  it("réservé aux administrateurs et limité en nombre", async () => {
    await expect(createEndpoint({ ...ctx, role: "member" }, { url: "https://hooks.exemple.fr/x", events: ["invoice.paid"] })).rejects.toMatchObject({
      status: 403,
    });
    await expect(createEndpoint(ctx, { url: "https://hooks.exemple.fr/x", events: [] })).rejects.toMatchObject({ status: 400 });
    const existing = (await listEndpoints(ctx)).length;
    for (let i = 0; i < WEBHOOK_MAX_ENDPOINTS - existing; i++) await createEndpoint(ctx, { url: `https://hooks.exemple.fr/n${i}`, events: ["invoice.paid"] });
    await expect(createEndpoint(ctx, { url: "https://hooks.exemple.fr/trop", events: ["invoice.paid"] })).rejects.toMatchObject({ status: 409 });
  });
});
