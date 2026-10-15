import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { offlineDescription, readOutbox, type OfflineQuote } from "@/lib/offline-quote";
import type { Ctx } from "@/lib/services/context";
import { createOfflineQuote, getDraft } from "@/lib/services/quotes";
import { freshDb, signUp } from "./helpers";

const q: OfflineQuote = {
  key: "0f8e2c1a-1111-4b2c-9d3e-123456789abc",
  title: "Salle de bains Mme Roux",
  clientName: "Mme Roux",
  clientPhone: "06 12 34 56 78",
  clientAddress: "Hameau des Combes, 05100 Briançon",
  note: "Accès par le chemin, pas de réseau sur place.",
  lines: [
    { label: "Dépose de la baignoire", quantity: "1", unit: "u", unitPrice: "180", vatPercent: "10" },
    { label: "Faïence murale", quantity: "12,5", unit: "m²", unitPrice: "55", vatPercent: "10" },
  ],
  createdAt: "2026-10-15T08:30:00.000Z",
};

describe("devis sans réseau : file du téléphone", () => {
  it("ne garde que les devis lisibles et décrit ce qui a été noté sur place", () => {
    expect(readOutbox(null)).toEqual([]);
    expect(readOutbox("pas du json")).toEqual([]);
    expect(readOutbox(JSON.stringify([q, { key: "x", title: "" }]))).toHaveLength(1);
    const d = offlineDescription(q);
    expect(d).toContain("Préparé sans réseau le 15/10/2026 10:30");
    expect(d).toContain("Client : Mme Roux, téléphone 06 12 34 56 78, adresse Hameau des Combes");
    expect(d).toContain("pas de réseau sur place");
  });
});

describe("devis sans réseau : création au retour du réseau", () => {
  let db: Database;
  let ctx: Ctx;
  let other: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "zone-blanche@exemple.fr");
    other = await signUp(db, "autre-zb@exemple.fr", "Autre");
  });

  it("crée le devis avec ses lignes, une seule fois par clé", async () => {
    await expect(createOfflineQuote(ctx, { ...q, title: "" })).rejects.toMatchObject({ status: 400 });
    const first = await createOfflineQuote(ctx, q);
    expect(first.created).toBe(true);
    const d = await getDraft(ctx, first.id);
    expect(d.title).toBe("Salle de bains Mme Roux");
    expect(d.sections[0].lines.map((l) => [l.label, l.quantity, l.unitPrice])).toEqual([
      ["Dépose de la baignoire", "1", "180"],
      ["Faïence murale", "12,5", "55"],
    ]);
    expect(await createOfflineQuote(ctx, q)).toEqual({ id: first.id, created: false });
    // La même clé envoyée par une autre entreprise crée son propre devis : les clés sont rangées par entreprise.
    const theirs = await createOfflineQuote(other, q);
    expect(theirs.id).not.toBe(first.id);
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM quotes WHERE org_id=$1", [ctx.orgId]);
    expect(Number(n)).toBe(1);
  });
});
