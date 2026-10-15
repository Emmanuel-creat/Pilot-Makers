import { describe, expect, it } from "vitest";
import { listCatalogDocuments } from "@/lib/services/datasheets";
import { leave } from "@/lib/services/presence";
import { listQuoteMedia } from "@/lib/services/quote-media";
import { createQuote } from "@/lib/services/quotes";
import { freshDb, makeCustomer, signUp } from "./helpers";

describe("cloisonnement : réponses identiques pour un devis d'une autre entreprise", () => {
  it("photos et présence d'un devis étranger répondent comme un devis inexistant", async () => {
    const db = await freshDb();
    const a = await signUp(db, "a@cloison.fr");
    const b = await signUp(db, "b@cloison.fr", "Autre");
    const id = await createQuote(a, { customerId: await makeCustomer(a) });
    expect(await listQuoteMedia(a, id)).toEqual([]);
    await expect(listQuoteMedia(b, id)).rejects.toMatchObject({ status: 404 });
    await expect(listQuoteMedia(b, "x")).rejects.toMatchObject({ status: 404 });
    await leave(a, id);
    await expect(leave(b, id)).rejects.toMatchObject({ status: 404 });
    const item = (await db.query<{ id: string }>("INSERT INTO catalog_items (org_id, reference, name) VALUES ($1,'CAR-1','Carrelage') RETURNING id", [a.orgId]))[0].id;
    expect(await listCatalogDocuments(a, item)).toEqual([]);
    await expect(listCatalogDocuments(b, item)).rejects.toMatchObject({ status: 404 });
  });
});
