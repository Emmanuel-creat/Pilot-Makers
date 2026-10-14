import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { complementsOf, isComplementary, rankTargets, recoSchema, tradeKeyOf } from "@/lib/recommendations";
import type { Ctx } from "@/lib/services/context";
import { convertLeadToQuote, getLead } from "@/lib/services/leads";
import { answerRecommendation, pendingRecommendations, recommendationsBoard, sendRecommendation } from "@/lib/services/network-recommendations";
import { createNetwork, getNetwork, joinNetwork } from "@/lib/services/networks";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("métiers complémentaires", () => {
  it("reconnaît le métier saisi librement", () => {
    expect(tradeKeyOf("Plombier chauffagiste")).toBe("plomberie");
    expect(tradeKeyOf("Carreleur faïencier")).toBe("carrelage");
    expect(tradeKeyOf("Électricien")).toBe("electricite");
    expect(tradeKeyOf("Plaquiste")).toBe("isolation");
    expect(tradeKeyOf("peinture")).toBe("peinture");
    expect(tradeKeyOf("Fleuriste")).toBeNull();
    expect(tradeKeyOf("")).toBeNull();
  });

  it("rapproche les métiers qui se suivent sur un chantier", () => {
    expect(complementsOf("plomberie")).toEqual(expect.arrayContaining(["carrelage", "electricite"]));
    expect(isComplementary("Plombier", "Carreleur")).toBe(true);
    expect(isComplementary("Carreleur", "Plombier")).toBe(true);
    expect(isComplementary("Plombier", "Plombier chauffagiste")).toBe(false);
    expect(isComplementary("Plombier", "Fleuriste")).toBe(false);
  });

  it("classe les confrères : complémentaires, autres, même métier", () => {
    const ranked = rankTargets("Plombier", [
      { orgId: "1", name: "Bernard Plomberie", trade: "Plombier", city: "" },
      { orgId: "2", name: "Zénith Carrelage", trade: "Carreleur", city: "" },
      { orgId: "3", name: "Atelier Couverture", trade: "Couvreur", city: "" },
      { orgId: "4", name: "Alpha Élec", trade: "Électricien", city: "" },
    ]);
    expect(ranked.map((r) => [r.name, r.complementary])).toEqual([
      ["Alpha Élec", true],
      ["Zénith Carrelage", true],
      ["Atelier Couverture", false],
      ["Bernard Plomberie", false],
    ]);
  });

  it("exige l'accord du client et un moyen de le joindre", () => {
    const base = { toOrg: "4f0c2b8e-0a52-4c39-9f4b-0d5d5b1e2a10", customerName: "Mme Roux", need: "Faïence murale de la salle de bains", phone: "0600000000" };
    expect(recoSchema.safeParse({ ...base, consent: true }).success).toBe(true);
    expect(recoSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(recoSchema.safeParse({ ...base, phone: "", consent: true }).success).toBe(false);
  });
});

describe("recommandations dans un réseau", () => {
  let db: Database;
  let plombier: Ctx;
  let carreleur: Ctx;
  let outsider: Ctx;
  let networkId: string;

  beforeAll(async () => {
    db = await freshDb();
    plombier = await signUp(db, "reco-plombier@exemple.fr");
    await completeProfile(plombier);
    await db.query("UPDATE organizations SET trade='Plombier chauffagiste', trade_name='Plomberie Martin' WHERE id=$1", [plombier.orgId]);
    carreleur = await signUp(db, "reco-carreleur@exemple.fr");
    await completeProfile(carreleur);
    await db.query("UPDATE organizations SET trade='Carreleur', trade_name='Carrelage Duval' WHERE id=$1", [carreleur.orgId]);
    outsider = await signUp(db, "reco-autre@exemple.fr");
    networkId = await createNetwork(plombier, { name: "Artisans de l'Ain" });
    await joinNetwork(carreleur, (await getNetwork(plombier, networkId)).joinCode);
  });

  it("transmet un client, le destinataire l'accepte en demande et l'émetteur suit la signature", async () => {
    const board = await recommendationsBoard(plombier, networkId);
    expect(board.targets).toEqual([expect.objectContaining({ orgId: carreleur.orgId, complementary: true })]);
    const raw = {
      toOrg: carreleur.orgId,
      customerName: "Mme Roux",
      phone: "06 12 34 56 78",
      email: "roux@exemple.fr",
      city: "Bourg-en-Bresse",
      need: "Faïence murale à poser sur 12 m² après la nouvelle douche",
      consent: true,
    };
    await expect(sendRecommendation(plombier, networkId, { ...raw, consent: false })).rejects.toMatchObject({ status: 400 });
    await expect(sendRecommendation(plombier, networkId, { ...raw, toOrg: outsider.orgId })).rejects.toMatchObject({ status: 400 });
    await expect(sendRecommendation(outsider, networkId, raw)).rejects.toMatchObject({ status: 404 });
    const id = await sendRecommendation(plombier, networkId, raw);

    expect(await pendingRecommendations(carreleur)).toBe(1);
    const inbox = await recommendationsBoard(carreleur, networkId);
    expect(inbox.received[0]).toMatchObject({ partner: "Plomberie Martin", customerName: "Mme Roux", phone: "", email: "", status: "envoyee" });
    await expect(answerRecommendation(plombier, id, true)).rejects.toMatchObject({ status: 404 });

    const { leadId } = await answerRecommendation(carreleur, id, true);
    await expect(answerRecommendation(carreleur, id, false)).rejects.toMatchObject({ status: 409 });
    const lead = await getLead(carreleur, leadId!);
    expect(lead).toMatchObject({ name: "Mme Roux", source: "recommandation", phone: "06 12 34 56 78" });
    expect(lead.description).toContain("Recommandé par Plomberie Martin");
    expect((await recommendationsBoard(carreleur, networkId)).received[0].phone).toBe("06 12 34 56 78");
    expect(await pendingRecommendations(carreleur)).toBe(0);

    const quoteId = await convertLeadToQuote(carreleur, leadId!);
    expect((await recommendationsBoard(plombier, networkId)).sent[0].signed).toBe(false);
    await db.query("UPDATE quotes SET status='accepted' WHERE id=$1", [quoteId]);
    const sent = (await recommendationsBoard(plombier, networkId)).sent[0];
    expect(sent).toMatchObject({ status: "acceptee", signed: true, partner: "Carrelage Duval" });
  });

  it("une recommandation déclinée garde le motif et ne crée pas de demande", async () => {
    const id = await sendRecommendation(plombier, networkId, {
      toOrg: carreleur.orgId,
      customerName: "M. Petit",
      phone: "0611111111",
      need: "Carrelage de terrasse de 30 m² cet été",
      consent: true,
    });
    expect((await answerRecommendation(carreleur, id, false, "Pas de terrasse cette saison")).leadId).toBeNull();
    const sent = (await recommendationsBoard(plombier, networkId)).sent.find((r) => r.id === id)!;
    expect(sent).toMatchObject({ status: "declinee", replyNote: "Pas de terrasse cette saison", signed: false });
  });
});
