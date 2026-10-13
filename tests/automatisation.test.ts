import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "@/lib/services/api-keys";
import type { Ctx } from "@/lib/services/context";
import { createCustomer } from "@/lib/services/customers";
import { apiListSubscriptions, apiSamples, apiSubscribe, apiUnsubscribe } from "@/lib/services/public-api";
import { createEndpoint, deliverWebhooks, listEndpoints, WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { freshDb, meta, signUp } from "./helpers";

let db: Database;
let owner: Ctx;

beforeAll(async () => {
  db = await freshDb();
  owner = await signUp(db, "automatisation@exemple.fr");
});

const respond = (status: number) => async () => new Response("", { status });

describe("abonnements des outils d'automatisation", () => {
  it("abonnement par clé, réception signée, désabonnement limité aux abonnements de la clé", async () => {
    const { key } = await createApiKey(owner, { name: "Zapier", scope: "write" });
    const ctx = await authenticateApiKey(db, key, meta);
    const sub = await apiSubscribe(ctx, { target_url: "https://hooks.zapier.com/hooks/standard/1/abc", event: "customer.created", label: "Zapier" });
    expect(sub.secret).toMatch(/^whsec_/);
    expect(sub.events).toEqual(["customer.created"]);
    await expect(apiSubscribe(ctx, { target_url: "http://127.0.0.1/x", event: "customer.created" })).rejects.toMatchObject({ status: 400 });
    await expect(apiSubscribe(ctx, { target_url: "https://exemple.fr/x", event: "devis.inconnu" })).rejects.toMatchObject({ status: 400 });

    const manual = await createEndpoint(owner, { url: "https://exemple.fr/manuel", events: ["invoice.paid"] });
    const listed = await apiListSubscriptions(ctx);
    expect(listed.data.map((e) => e.id)).toEqual([sub.id]);
    expect(listed.events).toEqual(WEBHOOK_EVENTS);
    const endpoints = await listEndpoints(owner);
    expect(endpoints.find((e) => e.id === sub.id)).toMatchObject({ label: "Zapier", api_key_name: "Zapier" });

    await expect(apiUnsubscribe(ctx, manual.id)).rejects.toMatchObject({ status: 404 });
    const read = await authenticateApiKey(db, (await createApiKey(owner, { name: "Lecture", scope: "read" })).key, meta);
    await expect(apiSubscribe(read, { target_url: "https://exemple.fr/y", event: "customer.created" })).rejects.toMatchObject({ status: 403 });
    expect(await apiUnsubscribe(ctx, sub.id)).toEqual({ deleted: true });
    expect((await apiListSubscriptions(ctx)).data).toHaveLength(0);
  });

  it("réponse 410 : l'abonnement de l'outil est retiré, une adresse manuelle est suspendue", async () => {
    const { key } = await createApiKey(owner, { name: "Make", scope: "write" });
    const ctx = await authenticateApiKey(db, key, meta);
    const sub = await apiSubscribe(ctx, { url: "https://hook.eu1.make.com/abc", events: ["customer.created"] });
    const manual = await createEndpoint(owner, { url: "https://exemple.fr/manuel-410", events: ["customer.created"] });
    await createCustomer(owner, { type: "particulier", last_name: "Roux", email: "roux@exemple.fr" });
    await deliverWebhooks(db, { fetchImpl: respond(410) });
    const after = await listEndpoints(owner);
    expect(after.some((e) => e.id === sub.id)).toBe(false);
    expect(after.find((e) => e.id === manual.id)?.active).toBe(false);
  });

  it("révoquer la clé retire ses abonnements", async () => {
    const { key } = await createApiKey(owner, { name: "n8n", scope: "write" });
    const ctx = await authenticateApiKey(db, key, meta);
    const sub = await apiSubscribe(ctx, { url: "https://n8n.exemple.fr/webhook/1", events: ["quote.accepted", "invoice.paid"] });
    const id = (await listApiKeys(owner)).find((k) => k.name === "n8n")!.id;
    await revokeApiKey(owner, id);
    expect((await listEndpoints(owner)).some((e) => e.id === sub.id)).toBe(false);
  });

  it("exemples de contenu pour chaque événement", () => {
    expect(apiSamples().data.map((s) => s.type)).toEqual(Object.keys(WEBHOOK_EVENTS));
    expect(apiSamples("invoice.paid").data[0].data).toHaveProperty("paid_cents");
  });
});
