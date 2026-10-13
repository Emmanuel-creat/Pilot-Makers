import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { addRge, aidIssues, aidMentions, listRge, removeRge, type RgeQualification } from "@/lib/services/aids";
import type { Ctx } from "@/lib/services/context";
import { addDays, createQuote, getDraft, getVersion, issueQuote, parisDate, previewQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const today = parisDate(new Date());
const inDays = (n: number) => parisDate(addDays(new Date(), n));

const QUALS: RgeQualification[] = [
  { id: "a", body: "Qualibat", number: "E-12345", domains: ["isolation_combles", "isolation_murs"], valid_until: "2027-06-30" },
  { id: "b", body: "Qualit'EnR", number: "QPAC/41234", domains: ["pac"], valid_until: "2026-01-31" },
];

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "rge@exemple.fr");
  await completeProfile(ctx);
});

describe("aides à la rénovation", () => {
  it("bloque un domaine sans qualification valide et une visite manquante", () => {
    const aid = { programs: ["mpr" as const], domains: ["isolation_combles" as const, "pac" as const], visitDate: "", estimatedAid: "" };
    const issues = aidIssues(aid, QUALS, "2026-10-13", "2026-11-12", 1_000_000);
    expect(issues.filter((i) => i.blocking).map((i) => i.code)).toEqual(["aid_rge", "aid_visit"]);
    expect(issues[0].message).toContain("en cours de validité");
    expect(aidIssues({ ...aid, programs: [] }, [], "2026-10-13", "2026-11-12", 0)).toEqual([]);
    expect(aidIssues({ ...aid, domains: [] }, QUALS, "2026-10-13", "2026-11-12", 0)[0].code).toBe("aid_domain");
    // Qualification qui expire pendant la validité du devis : simple avertissement.
    const late = aidIssues({ ...aid, domains: ["isolation_murs"], visitDate: "2026-10-01" }, QUALS, "2027-06-01", "2027-07-01", 100);
    expect(late).toMatchObject([{ code: "aid_rge_expiring", blocking: false }]);
    expect(
      aidIssues({ ...aid, domains: ["isolation_murs"], visitDate: "2026-10-01", estimatedAid: "50" }, QUALS, "2026-10-13", "2026-11-12", 100)[0].code,
    ).toBe("aid_amount");
  });

  it("rédige les mentions : dispositifs, qualification, visite et reste à charge", () => {
    const m = aidMentions(
      { programs: ["mpr", "cee"], domains: ["isolation_combles", "isolation_murs"], visitDate: "2026-10-02", estimatedAid: "3 000" },
      QUALS,
      "2026-10-13",
      1_200_000,
    );
    expect(m[0]).toBe("Travaux de rénovation énergétique pouvant bénéficier de : MaPrimeRénov', Certificats d'économies d'énergie (CEE).");
    expect(m[1]).toBe(
      "Entreprise qualifiée RGE : Qualibat, qualification n° E-12345 (Isolation des combles et toitures, Isolation des murs), valable jusqu'au 30/06/2027.",
    );
    expect(m[2]).toBe("Visite préalable du logement effectuée le 02/10/2026.");
    expect(m[3]).toMatch(/^Montant d'aides estimé : 3\s000,00\s€ ; reste à charge estimé : 9\s000,00\s€ TTC\./);
    expect(m.slice(4)).toHaveLength(2);
  });

  it("enregistre les qualifications et contrôle l'émission du devis", async () => {
    await expect(addRge(ctx, { body: "Qualibat", number: "E-1", domains: [], valid_until: inDays(400) })).rejects.toMatchObject({ status: 400 });
    const old = await addRge(ctx, { body: "Qualibat", number: "E-OLD", domains: ["isolation_combles"], valid_until: inDays(-5) });

    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    const aid = {
      programs: ["mpr" as const, "ecoptz" as const],
      domains: ["isolation_combles" as const],
      visitDate: inDays(-3),
      estimatedAid: "500",
    };
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Isolation des combles", sections: [{ ...d.sections[0], lines: [line()] }], energyAid: aid },
      d.draftRevision,
    );
    expect((await getDraft(ctx, id)).energyAid).toEqual(aid);
    const preview = await previewQuote(ctx, id);
    expect(preview.canIssue).toBe(false);
    expect(preview.issues.find((i) => i.code === "aid_rge")?.message).toContain("en cours de validité");
    await expect(issueQuote(ctx, id)).rejects.toMatchObject({ status: 422 });

    await addRge(ctx, { body: "Qualibat", number: "E-77001", domains: ["isolation_combles", "isolation_combles"], valid_until: inDays(500) });
    await removeRge(ctx, old);
    expect((await listRge(ctx)).map((q) => [q.number, q.domains])).toEqual([["E-77001", ["isolation_combles"]]]);
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.quote.energyAid?.programs).toEqual(["mpr", "ecoptz"]);
    expect(v.snapshot.mentions.join("\n")).toContain("qualification n° E-77001 (Isolation des combles et toitures)");
    expect(v.snapshot.mentions.join("\n")).toContain("MaPrimeRénov' doit être déposée");
  });

  it("n'ajoute rien aux devis ordinaires et réserve les qualifications aux réglages", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, energyAid: { programs: [], domains: ["pac"], visitDate: "", estimatedAid: "" } }, d.draftRevision);
    expect((await getDraft(ctx, id)).energyAid).toBeNull();
    const member = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(addRge(member, { body: "Qualibat", number: "E-2", domains: ["pac"], valid_until: today })).rejects.toMatchObject({ status: 403 });
  });
});
