import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import {
  clientInbox,
  createPortalLink,
  listQuoteMessages,
  openPortal,
  portalAnswerLink,
  portalLinkInfo,
  portalPdf,
  postFromPortal,
  postFromQuoteLink,
  publicThread,
  replyToClient,
  requestableLines,
  revokePortalLinks,
  setRequestHandled,
} from "@/lib/services/client-space";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, getShareLink, getVersion, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let customerId: string;
let pendingId: string;
let acceptedId: string;
let shareToken: string;
const META = { ip: "198.51.100.7" };

async function issued(title: string, lines: ReturnType<typeof line>[]) {
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  await saveDraft(ctx, id, { ...d, title, sections: [{ ...d.sections[0], lines }] }, d.draftRevision);
  await issueQuote(ctx, id);
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "espace@exemple.fr");
  await completeProfile(ctx);
  customerId = await makeCustomer(ctx);
  await db.query("UPDATE customers SET email='client@exemple.fr' WHERE id=$1", [customerId]);
  pendingId = await issued("Salle de bains", [line({ label: "Faïence murale" }), line({ label: "Receveur de douche", quantity: "1", unit: "u" })]);
  acceptedId = await issued("Cuisine", [line({ label: "Crédence" })]);
  await recordResponseManually(ctx, acceptedId, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  await createFinalInvoice(ctx, acceptedId);
  shareToken = new URL((await getShareLink(ctx, pendingId)).url).pathname.split("/").pop()!;
});

describe("messages et demandes de modification", () => {
  it("le client écrit depuis le lien du devis ; une modification vise une ligne précise", async () => {
    const v = await getVersion(db, ctx.orgId, pendingId, 1);
    const lines = requestableLines(v.snapshot);
    expect(lines.map((l) => l.label)).toEqual(["Faïence murale", "Receveur de douche"]);
    await expect(postFromQuoteLink(db, shareToken, { body: "x" }, META)).rejects.toMatchObject({ status: 400 });
    await expect(postFromQuoteLink(db, shareToken, { body: "Changer le modèle", kind: "modification" }, META)).rejects.toMatchObject({ status: 400 });
    await expect(postFromQuoteLink(db, shareToken, { body: "Autre", lineId: "inconnue" }, META)).rejects.toMatchObject({ status: 400 });
    await expect(postFromQuoteLink(db, "faux-jeton", { body: "Bonjour" }, META)).rejects.toMatchObject({ status: 404 });
    await postFromQuoteLink(db, shareToken, { body: "Peut-on commencer en novembre ?" }, META);
    await postFromQuoteLink(
      db,
      shareToken,
      { body: "Je préfère un receveur extra-plat de 120 cm.", kind: "modification", lineId: lines[1].id },
      META,
    );
    const notif = await db.query<{ subject: string }>("SELECT subject FROM emails WHERE kind='notification' AND subject LIKE '%modification%'");
    expect(notif[0].subject).toContain("« Receveur de douche »");
    expect(await clientInbox(ctx)).toMatchObject([{ quote_id: pendingId, unread: 2, open_requests: 1 }]);
  });

  it("l'entreprise lit, répond par e-mail et traite la demande", async () => {
    const list = await listQuoteMessages(ctx, pendingId);
    expect(list.map((m) => [m.author_type, m.kind, m.line_label])).toEqual([
      ["client", "message", ""],
      ["client", "modification", "Receveur de douche"],
    ]);
    expect(await clientInbox(ctx)).toMatchObject([{ unread: 0, open_requests: 1 }]);
    expect(await replyToClient(ctx, pendingId, "Oui, à partir du 3 novembre. Je vous envoie un devis modifié.")).toEqual({ emailed: true });
    const mail = await db.query<{ body: string }>("SELECT body FROM emails WHERE kind='client_message'");
    expect(mail[0].body).toMatch(/\/espace\/[\w-]+/);
    await setRequestHandled(ctx, list[1].id, true);
    expect(await clientInbox(ctx)).toEqual([]);
    await expect(setRequestHandled(ctx, list[0].id, true)).rejects.toMatchObject({ status: 404 });
    const thread = await publicThread(db, ctx.orgId, pendingId);
    expect(thread.at(-1)).toMatchObject({ author_type: "entreprise", author_name: ctx.userName });
  });
});

describe("espace client", () => {
  it("devis, factures et échanges au même endroit", async () => {
    const { token, emailed } = await createPortalLink(ctx, customerId, { send: true });
    expect(emailed).toBe(true);
    expect((await portalLinkInfo(ctx, customerId)).active).toBeGreaterThanOrEqual(2);
    const p = (await openPortal(db, token, META))!;
    expect(p.quotes.map((q) => [q.title, q.status, q.awaitingAnswer])).toEqual([
      ["Cuisine", "accepted", false],
      ["Salle de bains", "ready", true],
    ]);
    expect(p.quotes[1].messages).toHaveLength(3);
    expect(p.invoices).toHaveLength(1);
    expect(p.invoices[0].balanceCents).toBeGreaterThan(0);

    const pdf = await portalPdf(db, token, "facture", p.invoices[0].id, META);
    expect(Buffer.from(pdf.pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await portalPdf(db, token, "devis", pendingId, META)).name).toMatch(/^devis-/);
    await expect(portalPdf(db, token, "facture", pendingId, META)).rejects.toMatchObject({ status: 404 });

    // Répondre à un devis en attente ouvre un lien de réponse neuf.
    expect(await portalAnswerLink(db, token, pendingId, META)).toMatch(/\/d\/[\w-]+$/);
    await expect(portalAnswerLink(db, token, acceptedId, META)).rejects.toMatchObject({ status: 409 });
    await postFromPortal(db, token, acceptedId, { body: "Merci, quand passez-vous pour les finitions ?" }, META);
    expect((await listQuoteMessages(ctx, acceptedId, false)).map((m) => m.author_name)).toEqual([p.customerName]);

    // Un autre client, ou un lien révoqué, n'ouvre rien.
    const other = await signUp(db, "autre-espace@exemple.fr");
    await completeProfile(other);
    const otherCustomer = await makeCustomer(other);
    const { token: foreign } = await createPortalLink(other, otherCustomer);
    await expect(portalPdf(db, foreign, "devis", pendingId, META)).rejects.toMatchObject({ status: 404 });
    await revokePortalLinks(ctx, customerId);
    expect(await openPortal(db, token, META)).toBeNull();
  });
});
