import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { dossierSummary, parseEuros, type Participant } from "@/lib/renovation";
import type { Ctx } from "@/lib/services/context";
import { createNetwork, getNetwork, joinNetwork } from "@/lib/services/networks";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import {
  addRenovationParticipant,
  answerRenovationInvite,
  createRenovation,
  getRenovation,
  listRenovations,
  publicRenovation,
  removeRenovationParticipant,
  renovationPeers,
  shareRenovation,
  updateRenovationParticipant,
} from "@/lib/services/renovation";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const p = (o: Partial<Participant>): Participant => ({
  id: o.name ?? "x",
  name: "Entreprise",
  trade: "autre",
  status: "accepte",
  startDate: null,
  endDate: null,
  amountTtcCents: null,
  hasQuote: false,
  quoteStatus: null,
  quoteNumber: null,
  ...o,
});

describe("synthèse du dossier", () => {
  it("additionne les devis, ordonne les lots et signale ce qui manque", () => {
    const s = dossierSummary([
      p({ name: "Peinture Roy", trade: "peinture", startDate: "2026-11-20", endDate: "2026-11-25", amountTtcCents: 300000, hasQuote: true }),
      p({
        name: "Maçonnerie Durand",
        trade: "maconnerie",
        status: "pilote",
        startDate: "2026-11-02",
        endDate: "2026-11-10",
        amountTtcCents: 1200000,
        hasQuote: true,
        quoteStatus: "accepted",
      }),
      p({ name: "Élec Martin", trade: "electricite", status: "invite" }),
      p({ name: "Refus SA", trade: "sols", status: "refuse", amountTtcCents: 999, hasQuote: true }),
    ]);
    expect(s.participants.map((x) => x.name)).toEqual(["Maçonnerie Durand", "Peinture Roy", "Élec Martin"]);
    expect(s.totalTtcCents).toBe(1500000);
    expect(s.waiting).toEqual(["Élec Martin"]);
    expect(s.complete).toBe(false);
    expect(s.accepted).toBe(1);
    expect([s.from, s.to]).toEqual(["2026-11-02", "2026-11-25"]);
    expect(s.issues.some((i) => i.kind === "dates")).toBe(true);
  });

  it("montants en euros", () => {
    expect(parseEuros("12 500,50 €")).toBe(1250050);
    expect(parseEuros("")).toBeNull();
    expect(() => parseEuros("douze")).toThrow(/invalide/);
  });
});

describe("dossier partagé entre entreprises", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;
  let outsider: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "reno-a@exemple.fr", "Maçonnerie Durand");
    await completeProfile(a);
    b = await signUp(db, "reno-b@exemple.fr", "Élec Martin");
    await completeProfile(b);
    outsider = await signUp(db, "reno-c@exemple.fr");
    const net = await createNetwork(a, { name: "Rénovateurs du Rhône" });
    await joinNetwork(b, (await getNetwork(a, net)).joinCode);
  });

  it("le pilote invite, chaque entreprise rattache son devis, le client voit un seul dossier", async () => {
    await expect(createRenovation(a, { customerId: "", title: "Maison Bernard" })).rejects.toThrow(/client/);
    const id = await createRenovation(a, { customerId: await makeCustomer(a), title: "Rénovation maison Bernard", trade: "maconnerie" });
    expect((await renovationPeers(a)).map((x) => x.org_id)).toEqual([b.orgId]);
    await expect(addRenovationParticipant(a, id, { orgId: outsider.orgId })).rejects.toThrow(/réseaux/);
    await addRenovationParticipant(a, id, { orgId: b.orgId, trade: "electricite" });
    await expect(addRenovationParticipant(a, id, { orgId: b.orgId })).rejects.toMatchObject({ status: 409 });
    await addRenovationParticipant(a, id, { name: "Peintures Roy", trade: "peinture", amount: "3 000" });
    await expect(addRenovationParticipant(b, id, { name: "Intrus" })).rejects.toMatchObject({ status: 404 });
    await expect(getRenovation(outsider, id)).rejects.toMatchObject({ status: 404 });

    const inv = (await listRenovations(b)).find((r) => r.id === id)!;
    expect(inv).toMatchObject({ piloted: false, myStatus: "invite", customer: "" });
    await answerRenovationInvite(b, inv.myParticipantId!, true);
    await expect(answerRenovationInvite(b, inv.myParticipantId!, true)).rejects.toMatchObject({ status: 409 });

    const quoteB = await createQuote(b, { customerId: await makeCustomer(b) });
    const d = await getDraft(b, quoteB);
    await saveDraft(
      b,
      quoteB,
      { ...d, title: "Électricité", sections: [{ ...d.sections[0], lines: [line({ unitPrice: "100", quantity: "20" })] }] },
      d.draftRevision,
    );
    const quoteA = await createQuote(a, { customerId: await makeCustomer(a) });
    await expect(updateRenovationParticipant(b, inv.myParticipantId!, { quoteId: quoteA })).rejects.toThrow(/introuvable/);
    await updateRenovationParticipant(b, inv.myParticipantId!, { quoteId: quoteB });
    await expect(updateRenovationParticipant(b, inv.myParticipantId!, { start: "2026-11-12", end: "2026-11-14" })).rejects.toMatchObject({ status: 403 });

    const pilotView = await getRenovation(a, id);
    const elec = pilotView.participants.find((x) => x.orgId === b.orgId)!;
    expect(elec.hasQuote).toBe(true);
    expect(elec.amountTtcCents).toBeGreaterThan(0);
    await updateRenovationParticipant(a, elec.id, { start: "2026-11-12", end: "2026-11-14" });
    await expect(updateRenovationParticipant(a, elec.id, { amount: "10" })).rejects.toMatchObject({ status: 403 });

    const peerView = await getRenovation(b, id);
    expect(peerView.summary.totalTtcCents).toBeNull();
    expect(peerView.participants.find((x) => x.name === "Peintures Roy")!.amountTtcCents).toBeNull();
    expect(peerView.participants.find((x) => x.name === "Peintures Roy")!.hasQuote).toBe(true);

    const url = await shareRenovation(a, id);
    const token = url.split("/renovation/")[1];
    const pub = (await publicRenovation(db, token))!;
    expect(pub.pilot.name).toBe("Maçonnerie Durand");
    expect(pub.participants.map((x) => x.tradeLabel)).toContain("Électricité");
    expect(pub.summary.totalTtcCents).toBe(300000 + elec.amountTtcCents!);
    expect(await publicRenovation(db, "x".repeat(32))).toBeNull();

    const roy = pilotView.participants.find((x) => x.name === "Peintures Roy")!;
    await removeRenovationParticipant(a, roy.id);
    await expect(removeRenovationParticipant(a, pilotView.participants.find((x) => x.status === "pilote")!.id)).rejects.toMatchObject({ status: 404 });
    expect((await getRenovation(a, id)).participants).toHaveLength(2);
  });
});
