import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { agencyActivity, assignMemberAgency, createAgency, deleteAgency, listAgencies, setQuoteAgency } from "@/lib/services/agencies";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, listQuotes, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let owner: Ctx;
let worker: Ctx;

async function issued(ctx: Ctx, accept = false) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    { ...d, title: "Sol", site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines: [line()] }] },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  if (accept) await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  owner = await signUp(db, "siege@agences.fr");
  await completeProfile(owner);
  const other = await signUp(db, "agence@agences.fr", "Autre");
  await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'admin')", [owner.orgId, other.userId]);
  worker = { ...other, orgId: owner.orgId, role: "admin", jobFunction: null } as Ctx;
});

describe("agences", () => {
  it("crée les agences avec un nom unique et un SIRET valide", async () => {
    await expect(createAgency(owner, { name: "A", city: "", siret: "" })).rejects.toMatchObject({ status: 400 });
    await expect(createAgency(owner, { name: "Lyon Est", city: "", siret: "123" })).rejects.toThrow(/14 chiffres/);
    await createAgency(owner, { name: "Lyon Est", city: "Villeurbanne", siret: "732 829 320 00082" });
    await expect(createAgency(owner, { name: "lyon est", city: "", siret: "" })).rejects.toMatchObject({ status: 409 });
    await createAgency(owner, { name: "Grenoble", city: "Grenoble", siret: "" });
    expect((await listAgencies(owner)).map((a) => [a.name, a.siret])).toEqual([
      ["Grenoble", ""],
      ["Lyon Est", "73282932000082"],
    ]);
  });

  it("rattache les devis à l'agence de leur auteur et compare l'activité", async () => {
    const [grenoble, lyon] = await listAgencies(owner);
    await assignMemberAgency(owner, worker.userId, lyon.id);
    await expect(assignMemberAgency(owner, worker.userId, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
    const q1 = await issued(worker, true);
    await issued(worker);
    const q3 = await issued(owner);
    const q = (await db.query<{ id: string; agency_id: string | null }>("SELECT id, agency_id FROM quotes WHERE org_id=$1", [owner.orgId])).reduce(
      (m, r) => ({ ...m, [r.id]: r.agency_id }),
      {} as Record<string, string | null>,
    );
    expect(q[q1]).toBe(lyon.id);
    expect(q[q3]).toBeNull();
    const act = await agencyActivity(owner);
    expect(act.map((a) => [a.name, a.members, a.issued, a.accepted, a.rate])).toEqual([
      ["Grenoble", 0, 0, 0, null],
      ["Lyon Est", 1, 2, 1, 50],
      ["Sans agence", 1, 1, 0, 0],
    ]);
    expect(act[1].acceptedHtCents).toBeGreaterThan(0);
    expect((await listQuotes(owner, { agencyId: lyon.id })).total).toBe(2);
    expect((await listQuotes(owner, { agencyId: "aucune" })).total).toBe(1);
    await setQuoteAgency(owner, q3, grenoble.id);
    expect((await listQuotes(owner, { agencyId: grenoble.id })).total).toBe(1);
  });

  it("réserve les réglages et garde devis et membres à la suppression", async () => {
    const [grenoble, lyon] = await listAgencies(owner);
    const ouvrier = { ...worker, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(createAgency(ouvrier, { name: "Valence", city: "", siret: "" })).rejects.toMatchObject({ status: 403 });
    expect((await agencyActivity(ouvrier))[0].acceptedHtCents).toBeNull();
    const stranger = await signUp(db, "intrus@agences.fr", "Intrus");
    await expect(deleteAgency(stranger, lyon.id)).rejects.toMatchObject({ status: 404 });
    await deleteAgency(owner, lyon.id);
    await deleteAgency(owner, grenoble.id);
    expect(await listAgencies(owner)).toEqual([]);
    expect((await listQuotes(owner, { agencyId: "aucune" })).total).toBe(3);
  });
});
