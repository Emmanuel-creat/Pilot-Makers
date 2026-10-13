import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { groupRuns, runAt } from "@/lib/calc/groups";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "lots@exemple.fr");
  await completeProfile(ctx);
});

const sec = (id: string, group: string | undefined, items = true) => ({ id, group, lines: items ? [{ kind: "item" }] : [{ kind: "note" }] });

describe("regroupements de lots", () => {
  it("additionne les lots consécutifs d'un même bâtiment", () => {
    const subtotal: Record<string, number> = { a: 100, b: 250, c: 40, d: 7, e: 1 };
    const runs = groupRuns(
      [sec("a", "Bâtiment A"), sec("b", " Bâtiment A "), sec("c", ""), sec("d", "Bâtiment B"), sec("e", "Bâtiment A")],
      (id) => subtotal[id],
    );
    expect(runs.map((r) => [r.group, r.start, r.end, r.cents])).toEqual([
      ["Bâtiment A", 0, 1, 350],
      ["", 2, 2, 40],
      ["Bâtiment B", 3, 3, 7],
      ["Bâtiment A", 4, 4, 1],
    ]);
    expect(runAt(runs, 1)?.group).toBe("Bâtiment A");
    expect(runAt(runs, 2)).toBeUndefined();
  });

  it("signale un regroupement sans ligne chiffrée", () => {
    const runs = groupRuns([sec("a", "Combles", false)], () => 0);
    expect(runs[0].items).toBe(false);
  });

  it("enregistre le bâtiment de chaque lot et le fige à l'émission", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Résidence Les Tilleuls",
        site: { line1: "2 rue des Tilleuls", line2: "", postalCode: "69003", city: "Lyon" },
        paymentTerms: "Solde à réception de facture.",
        sections: [
          { id: randomUUID(), group: "Bâtiment A", title: "Peinture", description: "", lines: [line()] },
          { id: randomUUID(), group: "Bâtiment A", title: "Sols", description: "", lines: [line()] },
          { id: randomUUID(), group: "Bâtiment B", title: "Peinture", description: "", lines: [line({ quantity: "10" })] },
          { id: randomUUID(), title: "Installation de chantier", description: "", lines: [line({ quantity: "1" })] },
        ],
      },
      d.draftRevision,
    );
    const saved = await getDraft(ctx, id);
    expect(saved.sections.map((s) => s.group ?? "")).toEqual(["Bâtiment A", "Bâtiment A", "Bâtiment B", ""]);
    await expect(
      saveDraft(ctx, id, { ...saved, sections: [{ ...saved.sections[0], group: "x".repeat(81) }] }, saved.draftRevision),
    ).rejects.toMatchObject({ status: 400 });

    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.sections[0].group).toBe("Bâtiment A");
    const subtotals = new Map(v.snapshot.calc.sections.map((s) => [s.id, s.subtotalCents]));
    const runs = groupRuns(v.snapshot.sections, (sid) => subtotals.get(sid) ?? 0);
    expect(runs.find((r) => r.group === "Bâtiment A")?.cents).toBe(180000);
  });
});
