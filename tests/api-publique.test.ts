import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { API_ENDPOINTS, openApiSpec } from "@/lib/openapi";
import { authenticateApiKey, createApiKey, keyFromHeaders, listApiKeys, revokeApiKey } from "@/lib/services/api-keys";
import type { Ctx } from "@/lib/services/context";
import { apiCreateCatalogItem, apiCreateCustomer, apiGetQuote, apiListCustomers, apiListQuotes, apiMe, apiQuotePdf } from "@/lib/services/public-api";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { acceptInvite, changeRole, inviteMember } from "@/lib/services/team";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let owner: Ctx;

beforeAll(async () => {
  db = await freshDb();
  owner = await signUp(db, "api@exemple.fr");
  await completeProfile(owner);
});

describe("clés d'API", () => {
  it("création affichée une fois, empreinte seule en base, révocation", async () => {
    const { key, scopes } = await createApiKey(owner, { name: "Comptabilité", scope: "read" });
    expect(key).toMatch(/^pm_[A-Za-z0-9_-]{40,}$/);
    expect(scopes).toEqual(["read"]);
    const stored = await db.query<{ key_hash: string; prefix: string }>("SELECT key_hash, prefix FROM api_keys");
    expect(stored[0].key_hash).not.toContain(key);
    expect(key.startsWith(stored[0].prefix)).toBe(true);

    const ctx = await authenticateApiKey(db, key, meta);
    expect(ctx.orgId).toBe(owner.orgId);
    expect(ctx.apiKey?.scopes).toEqual(["read"]);
    expect((await apiMe(ctx)).scopes).toEqual(["read"]);
    expect((await listApiKeys(owner))[0].last_used_at).not.toBeNull();

    await expect(authenticateApiKey(db, key + "x", meta)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateApiKey(db, "sk_" + key, meta)).rejects.toMatchObject({ status: 401 });
    await revokeApiKey(owner, (await listApiKeys(owner))[0].id);
    await expect(authenticateApiKey(db, key, meta)).rejects.toMatchObject({ status: 401 });
  });

  it("lecture des en-têtes Authorization et X-Api-Key", () => {
    expect(keyFromHeaders(new Headers({ authorization: "Bearer pm_abc" }))).toBe("pm_abc");
    expect(keyFromHeaders(new Headers({ "x-api-key": "pm_def" }))).toBe("pm_def");
    expect(keyFromHeaders(new Headers({ authorization: "Basic xyz" }))).toBe("");
  });

  it("une clé en lecture ne peut pas écrire ; une clé ne crée pas d'autre clé", async () => {
    const { key } = await createApiKey(owner, { name: "Tableur", scope: "read" });
    const ctx = await authenticateApiKey(db, key, meta);
    await expect(apiCreateCustomer(ctx, { last_name: "Martin" })).rejects.toMatchObject({ status: 403 });
    await expect(createApiKey(ctx, { name: "Autre" })).rejects.toMatchObject({ status: 403 });
  });

  it("la clé d'un administrateur rétrogradé cesse de fonctionner ; un membre ne crée pas de clé", async () => {
    const { token } = await inviteMember(owner, { email: "adjoint@exemple.fr", role: "admin" });
    const admin = await signUp(db, "adjoint@exemple.fr", "Perso");
    await acceptInvite(admin, token);
    const inOrg = { ...admin, orgId: owner.orgId, role: "admin" as const };
    const { key } = await createApiKey(inOrg, { name: "Adjoint", scope: "write" });
    expect((await authenticateApiKey(db, key, meta)).userId).toBe(admin.userId);
    await changeRole(owner, admin.userId, "member");
    await expect(authenticateApiKey(db, key, meta)).rejects.toMatchObject({ status: 401 });
    await expect(createApiKey({ ...inOrg, role: "member" }, { name: "Non" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("adresses de l'API", () => {
  it("clients, catalogue et devis, sans notes internes ni données d'une autre entreprise", async () => {
    const { key } = await createApiKey(owner, { name: "Automatisation", scope: "write" });
    const ctx = await authenticateApiKey(db, key, meta);

    const c = await apiCreateCustomer(ctx, { type: "particulier", last_name: "Lemoine", first_name: "Anne", email: "anne@exemple.fr" });
    expect(c.id).toBeTruthy();
    await expect(
      apiCreateCustomer(ctx, { type: "particulier", last_name: "Lemoine", first_name: "Anne", email: "anne@exemple.fr" }),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect((await apiListCustomers(ctx, { q: "lemoine", limit: 10, offset: 0 })).data).toHaveLength(1);

    const item = await apiCreateCatalogItem(ctx, { name: "Ragréage", unit: "m2", unit_price: "18", vat_percent: "10" });
    expect(item.unit_price4).toBe(180000);

    const qid = await createQuote(owner, { customerId: await makeCustomer(owner) });
    const d = await getDraft(owner, qid);
    await saveDraft(
      owner,
      qid,
      { ...d, title: "Cuisine", internalNotes: "Marge serrée", sections: [{ ...d.sections[0], lines: [line()] }] },
      d.draftRevision,
    );
    await expect(apiQuotePdf(ctx, qid)).rejects.toMatchObject({ status: 404 });
    await issueQuote(owner, qid);
    const q = await apiGetQuote(ctx, qid);
    expect(q.title).toBe("Cuisine");
    expect("internalNotes" in q).toBe(false);
    expect(q.totals.ttcCents).toBeGreaterThan(0);
    expect(q.versions).toHaveLength(1);
    const pdf = await apiQuotePdf(ctx, qid);
    expect(Buffer.from(pdf.pdf).subarray(0, 4).toString()).toBe("%PDF");
    const list = await apiListQuotes(ctx, { page: 1, pageSize: 10 });
    expect(list.total).toBe(1);
    expect("marginCents" in list.data[0]).toBe(false);

    const other = await signUp(db, "autre@exemple.fr", "Autre entreprise");
    const otherKey = await createApiKey(other, { name: "Autre", scope: "read" });
    const otherCtx = await authenticateApiKey(db, otherKey.key, meta);
    await expect(apiGetQuote(otherCtx, qid)).rejects.toMatchObject({ status: 404 });
    expect((await apiListCustomers(otherCtx, { limit: 50, offset: 0 })).data).toHaveLength(0);
  });

  it("description OpenAPI cohérente", () => {
    const spec = openApiSpec("https://app.exemple.fr");
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.servers[0].url).toBe("https://app.exemple.fr");
    for (const e of API_ENDPOINTS) expect(spec.paths[e.path][e.method.toLowerCase()]).toBeTruthy();
    expect(Object.keys(spec.paths["/api/v1/customers"])).toEqual(["get", "post"]);
  });
});
