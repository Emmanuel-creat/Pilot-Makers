import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { depositKept, detailKept, measure, MIN_CASES, priceKept, publicSentence, quickKept, readCommitments } from "@/lib/commitments";
import { myCommitments, publicCommitments, setCommitments } from "@/lib/services/commitments";
import { createFinalInvoice } from "@/lib/services/invoices";
import { createLead } from "@/lib/services/leads";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { publicShowcase, updateShowcase } from "@/lib/services/showcase";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("engagements vérifiés : règles", () => {
  it("vérifie chaque engagement sur un fait mesurable", () => {
    expect(depositKept("")).toBe(true);
    expect(depositKept("30")).toBe(true);
    expect(depositKept("30,5 %")).toBe(false);
    expect(depositKept("abc")).toBe(false);
    const item = { kind: "item", quantity: "2", unitPrice: "10" };
    expect(detailKept([item])).toBe(false);
    expect(detailKept([item, { ...item, unitPrice: "0" }, { kind: "note", quantity: "1", unitPrice: "5" }])).toBe(false);
    expect(detailKept([item, { ...item, quantity: "1,5" }])).toBe(true);
    expect(priceKept(100_000, 20_000, 121_200)).toBe(true);
    expect(priceKept(100_000, 0, 101_001)).toBe(false);
    const d = new Date("2026-10-01T08:00:00Z");
    expect(quickKept(d, new Date("2026-10-08T08:00:00Z"))).toBe(true);
    expect(quickKept(d, new Date("2026-10-08T09:00:00Z"))).toBe(false);
    expect(readCommitments(["prix", "inconnu", "prix", 3])).toEqual(["prix"]);
    expect(readCommitments("x")).toEqual([]);
  });

  it("ne publie un taux qu'à partir de trois cas, et le publie même s'il est mauvais", () => {
    const few = measure("acompte", [{ ref: "D1", kept: true }]);
    expect(few.rate).toBeNull();
    expect(publicSentence(few)).toContain(`moins de ${MIN_CASES} cas`);
    const m = measure("acompte", [
      { ref: "D1", kept: true },
      { ref: "D2", kept: false },
      { ref: "D3", kept: true },
    ]);
    expect(m).toMatchObject({ cases: 3, kept: 2, rate: 67, missed: ["D2"] });
    expect(publicSentence(m)).toBe("Tenu dans 67 % des cas : 2 sur 3 sur les douze derniers mois, vérifié sur les documents émis.");
  });
});

describe("engagements vérifiés : mesure sur les documents", () => {
  let db: Database;
  let ctx: Ctx;
  let numbers: string[] = [];

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "engagements@exemple.fr");
    await completeProfile(ctx);
    const issue = async (deposit: string, lines: number) => {
      const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
      const d = await getDraft(ctx, id);
      await saveDraft(
        ctx,
        id,
        {
          ...d,
          title: "Salle de bains",
          depositPercent: deposit,
          site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
          sections: [{ ...d.sections[0], lines: Array.from({ length: lines }, () => line()) }],
        },
        d.draftRevision,
      );
      await issueQuote(ctx, id);
      return id;
    };
    const a = await issue("30", 2);
    await issue("50", 2);
    const lead = await createLead(ctx, { name: "Paul Durand", phone: "0601020304", description: "Douche", source: "telephone" });
    const fromLead = await issue("", 1);
    await db.query("UPDATE leads SET quote_id=$2 WHERE id=$1", [lead, fromLead]);
    await recordResponseManually(ctx, a, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    await createFinalInvoice(ctx, a);
    numbers = (await db.query<{ number: string }>("SELECT number FROM quotes WHERE org_id=$1 AND issued_at IS NOT NULL ORDER BY issued_at", [ctx.orgId])).map(
      (r) => r.number,
    );
  });

  it("mesure chaque engagement et liste les devis où il n'est pas tenu", async () => {
    const c = await myCommitments(ctx);
    expect(c.hasShowcase).toBe(false);
    const by = Object.fromEntries(c.measures.map((m) => [m.key, m]));
    expect(by.acompte).toMatchObject({ cases: 3, kept: 2, rate: 67, missed: [numbers[1]] });
    expect(by.detail).toMatchObject({ cases: 3, kept: 2, missed: [numbers[2]] });
    expect(by.prix).toMatchObject({ cases: 1, kept: 1, rate: null });
    expect(by.rapidite).toMatchObject({ cases: 1, kept: 1 });
  });

  it("publie sur la vitrine les engagements choisis, sans aucun numéro de devis", async () => {
    await expect(setCommitments(ctx, ["acompte"])).rejects.toMatchObject({ status: 400 });
    await updateShowcase(ctx, { enabled: true, slug: "engagements-lyon", intro: "", area: "", show_phone: "", show_email: "" });
    expect(await setCommitments(ctx, ["acompte", "nope", "prix"])).toEqual(["acompte", "prix"]);
    const p = await publicShowcase(db, "engagements-lyon");
    expect(p?.commitments.map((m) => [m.key, m.rate])).toEqual([
      ["acompte", 67],
      ["prix", null],
    ]);
    expect(JSON.stringify(p?.commitments)).not.toContain(numbers[1]);
    expect(await publicCommitments(db, ctx.orgId, [])).toEqual([]);
    await setCommitments(ctx, []);
    expect((await publicShowcase(db, "engagements-lyon"))?.commitments).toEqual([]);
  });
});
