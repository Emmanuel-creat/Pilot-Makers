import { beforeAll, describe, expect, it } from "vitest";
import { convert, currencyIssues, foreignMention, formatForeign, normalizeForeign, parseRate } from "@/lib/currency";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("devises : calculs", () => {
  it("lit les taux et refuse les valeurs déraisonnables", () => {
    expect(parseRate("0,9412")).toBe(0.9412);
    expect(parseRate("")).toBeNull();
    expect(parseRate("0")).toBeNull();
    expect(parseRate("abc")).toBeNull();
  });

  it("impose la parité fixe des francs CFA et CFP", () => {
    expect(normalizeForeign({ code: "XOF", rate: "600" })).toEqual({ code: "XOF", rate: "655.957" });
    expect(normalizeForeign({ code: "EUR", rate: "1" })).toBeNull();
    expect(normalizeForeign({ code: "CHF", rate: "0,94" })).toEqual({ code: "CHF", rate: "0.94" });
  });

  it("convertit et formate", () => {
    expect(convert(100_000, { code: "CHF", rate: "0.94" })).toBeCloseTo(940);
    expect(formatForeign(940, "CHF")).toBe("940,00 CHF");
    expect(formatForeign(convert(100_000, { code: "XOF", rate: "655.957" }), "XOF")).toBe("655 957 XOF");
    const m = foreignMention({ code: "CHF", rate: "0.94" }, 120_000, "14 octobre 2026");
    expect(m).toContain("1 128,00 CHF (1 EUR = 0,94 CHF, taux retenu le 14 octobre 2026)");
    expect(m).toContain("dû est celui exprimé en euros");
  });

  it("bloque une devise sans taux", () => {
    expect(currencyIssues({ code: "GBP", rate: "" })[0]).toMatchObject({ code: "foreign_rate", blocking: true });
    expect(currencyIssues({ code: "GBP", rate: "0,86" })).toEqual([]);
    expect(currencyIssues(null)).toEqual([]);
  });
});

describe("devises : devis", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "devises@exemple.fr");
    await completeProfile(ctx);
  });

  it("garde la devise en brouillon, bloque sans taux puis imprime la contre-valeur", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    let d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Chalet", foreignCurrency: { code: "CHF", rate: "" }, sections: [{ ...d.sections[0], lines: [line()] }] },
      d.draftRevision,
    );
    d = await getDraft(ctx, id);
    expect(d.foreignCurrency).toEqual({ code: "CHF", rate: "" });
    await expect(issueQuote(ctx, id)).rejects.toThrow(/taux/);
    await saveDraft(ctx, id, { ...d, foreignCurrency: { code: "CHF", rate: "0,94" } }, d.draftRevision);
    await issueQuote(ctx, id);
    const v = await db.query<{ snapshot: { mentions: string[]; quote: { foreignCurrency?: unknown } } }>(
      "SELECT snapshot FROM quote_versions WHERE quote_id=$1",
      [id],
    );
    expect(v[0].snapshot.quote.foreignCurrency).toEqual({ code: "CHF", rate: "0.94" });
    expect(v[0].snapshot.mentions.some((m) => m.startsWith("Contre-valeur indicative du total TTC"))).toBe(true);
  });
});
