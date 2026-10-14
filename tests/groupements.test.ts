import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { allocate, consortiumIssues, conventionClauses } from "@/lib/consortium";
import {
  addConsortiumMember,
  answerConsortiumInvitation,
  assignLot,
  createConsortium,
  myConsortiumInvitations,
  quoteConsortium,
  removeConsortiumMember,
} from "@/lib/services/consortia";
import type { Ctx } from "@/lib/services/context";
import { createNetwork, getNetwork, joinNetwork } from "@/lib/services/networks";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const SECTIONS = [
  { id: "s1", title: "Gros œuvre", subtotalCents: 600000 },
  { id: "s2", title: "Électricité", subtotalCents: 300000 },
  { id: "s3", title: "Peinture", subtotalCents: 100000 },
];

describe("répartition du groupement", () => {
  it("répartit le total HT au prorata des lots, remise globale comprise", () => {
    const members = [
      { id: "a", name: "Maçonnerie Blanc", status: "mandataire" as const, sectionIds: ["s1", "s3"] },
      { id: "b", name: "Élec Morel", status: "accepte" as const, sectionIds: ["s2"] },
    ];
    expect(allocate(SECTIONS, members, 950000)).toEqual([
      { memberId: "a", name: "Maçonnerie Blanc", lots: ["Gros œuvre", "Peinture"], amountCents: 665000, shareBp: 7000 },
      { memberId: "b", name: "Élec Morel", lots: ["Électricité"], amountCents: 285000, shareBp: 3000 },
    ]);
    expect(consortiumIssues(SECTIONS, members)).toEqual([]);
  });

  it("signale lots libres, invitations en attente et refus", () => {
    const issues = consortiumIssues(SECTIONS, [
      { id: "a", name: "Maçonnerie Blanc", status: "mandataire", sectionIds: ["s1"] },
      { id: "b", name: "Élec Morel", status: "invite", sectionIds: ["s2"] },
      { id: "c", name: "Peintures Roy", status: "refuse", sectionIds: ["s3"] },
    ]);
    expect(issues).toEqual([
      "Lots sans entreprise : Peinture",
      "Élec Morel n'a pas encore accepté sa participation",
      "Peintures Roy a refusé : ses lots sont à réattribuer",
    ]);
  });

  it("adapte la convention à la forme du groupement", () => {
    expect(conventionClauses("solidaire", true, "Blanc", "École").join(" ")).toContain("totalité du marché");
    expect(conventionClauses("conjoint", true, "Blanc", "École").join(" ")).toContain("le mandataire est en outre solidaire");
    expect(conventionClauses("conjoint", false, "Blanc", "École").join(" ")).not.toContain("solidaire de chacun");
  });
});

describe("groupement sur un devis", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;
  let outsider: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "gme-a@exemple.fr");
    await completeProfile(a);
    b = await signUp(db, "gme-b@exemple.fr");
    await completeProfile(b);
    outsider = await signUp(db, "gme-c@exemple.fr");
    await completeProfile(outsider);
    const net = await createNetwork(a, { name: "Bâtisseurs de Savoie" });
    await joinNetwork(b, (await getNetwork(a, net)).joinCode);
  });

  it("invite un confrère, ajoute un extérieur, répartit les lots et suit les réponses", async () => {
    const quoteId = await createQuote(a, { customerId: await makeCustomer(a) });
    const d = await getDraft(a, quoteId);
    await saveDraft(
      a,
      quoteId,
      {
        ...d,
        title: "Groupe scolaire",
        sections: [
          { ...d.sections[0], title: "Gros œuvre", lines: [line({ unitPrice: "100", quantity: "60" })] },
          { id: "8a0d4c9e-0f7b-4e57-9a51-3c1d2b4e5f60", title: "Électricité", description: "", lines: [line({ unitPrice: "100", quantity: "30" })] },
          { id: "9b1e5d0f-1a8c-4f68-8b62-4d2e3c5f6a71", title: "Peinture", description: "", lines: [line({ unitPrice: "100", quantity: "10" })] },
        ],
      },
      d.draftRevision,
    );
    expect((await quoteConsortium(a, quoteId)).consortium).toBeNull();
    const id = await createConsortium(a, quoteId, "conjoint", true);
    await expect(createConsortium(a, quoteId, "solidaire", true)).rejects.toMatchObject({ status: 409 });

    let v = await quoteConsortium(a, quoteId);
    expect(v.candidates.map((c) => c.org_id)).toEqual([b.orgId]);
    expect(v.consortium!.issues).toEqual(["Un groupement réunit au moins deux entreprises"]);

    await expect(addConsortiumMember(a, id, { orgId: outsider.orgId })).rejects.toMatchObject({ status: 400 });
    await addConsortiumMember(a, id, { orgId: b.orgId });
    await expect(addConsortiumMember(a, id, { orgId: b.orgId })).rejects.toMatchObject({ status: 409 });
    await expect(addConsortiumMember(a, id, { name: "Peintures Roy", siret: "123" })).rejects.toMatchObject({ status: 400 });
    await addConsortiumMember(a, id, { name: "Peintures Roy", trade: "Peintre" });
    await expect(addConsortiumMember(outsider, id, { name: "Intrus" })).rejects.toMatchObject({ status: 404 });

    v = await quoteConsortium(a, quoteId);
    const [, elec, paint] = v.consortium!.members;
    await assignLot(a, id, v.sections[1].id, elec.id);
    await assignLot(a, id, v.sections[2].id, paint.id);
    v = await quoteConsortium(a, quoteId);
    expect(v.consortium!.shares.map((s) => [s.name, s.amountCents])).toEqual([
      [v.consortium!.members[0].name, 600000],
      [elec.name, 300000],
      ["Peintures Roy", 100000],
    ]);
    expect(v.consortium!.issues).toEqual([`${elec.name} n'a pas encore accepté sa participation`]);

    const inv = await myConsortiumInvitations(b);
    expect(inv).toEqual([expect.objectContaining({ status: "invite", title: "Groupe scolaire", lots: ["Électricité"], form: "conjoint" })]);
    await answerConsortiumInvitation(b, inv[0].id, true);
    await expect(answerConsortiumInvitation(b, inv[0].id, false)).rejects.toMatchObject({ status: 409 });
    expect((await quoteConsortium(a, quoteId)).consortium!.issues).toEqual([]);

    await removeConsortiumMember(a, id, paint.id);
    v = await quoteConsortium(a, quoteId);
    expect(v.consortium!.members).toHaveLength(2);
    expect(v.consortium!.members[0].sectionIds).toContain(v.sections[2].id);
    await expect(removeConsortiumMember(a, id, v.consortium!.members[0].id)).rejects.toMatchObject({ status: 404 });
  });
});
