/** Import d'un DPGF ou d'un BPU en devis, puis export du tableau de l'acheteur rempli avec les prix du devis. */

import { randomUUID } from "node:crypto";
import { toCsv } from "@/lib/csv";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { readTable, SheetError } from "@/lib/sheet";
import { bestMatch, detectColumns, fillTable, readItems, type TenderColumns, type TenderKind } from "@/lib/tender";
import { parseScaled } from "@/lib/calc/decimal";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import type { DraftLine, DraftSection } from "./quote-types";
import { createQuote, getDraft, saveDraft } from "./quotes";

export const TENDER_MAX_BYTES = 5_000_000;
const MAX_ITEMS = 1500;

const price = (unitPrice4: number) => (unitPrice4 / 10000).toFixed(2);

export async function importTender(ctx: Ctx, input: { bytes: Uint8Array; fileName: string; customerId?: string | null; title?: string }) {
  requireWritable(ctx);
  if (input.bytes.length > TENDER_MAX_BYTES) throw badRequest("Fichier trop lourd (5 Mo au plus)");
  let rows: string[][];
  try {
    rows = readTable(input.bytes, input.fileName);
  } catch (e) {
    if (e instanceof SheetError) throw badRequest(e.message);
    throw e;
  }
  const cols = detectColumns(rows);
  if (!cols) throw badRequest("Colonnes non reconnues : le tableau doit avoir une colonne Désignation et une colonne Unité, Quantité ou Prix unitaire");
  const { kind, items } = readItems(rows, cols);
  if (!items.some((i) => !i.section)) throw badRequest("Aucun poste à chiffrer trouvé dans le tableau");
  if (items.length > MAX_ITEMS) throw badRequest(`${MAX_ITEMS} postes au plus par import`);
  const catalog = (
    await ctx.db.query<{ id: string; name: string; unit: string; unit_price4: unknown; vat_bp: number; category: string }>(
      "SELECT id, name, unit, unit_price4, vat_bp, category FROM catalog_items WHERE org_id=$1 AND active",
      [ctx.orgId],
    )
  ).map((c) => ({ ...c, unit_price4: num(c.unit_price4) }));

  const quoteId = await createQuote(ctx, { customerId: input.customerId || null, title: input.title?.trim() || input.fileName.replace(/\.[a-z0-9]+$/i, "") });
  const draft = await getDraft(ctx, quoteId);
  const sections: DraftSection[] = [];
  const lineMap: Record<string, string> = {};
  let matched = 0;
  let current: DraftSection | null = null;
  for (const it of items) {
    if (it.section) {
      current = { id: randomUUID(), title: [it.ref, it.label].filter(Boolean).join(" ").slice(0, 200), description: "", lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: randomUUID(), title: "", description: "", lines: [] };
      sections.push(current);
    }
    const m = bestMatch(it, catalog);
    if (m) matched++;
    const line: DraftLine = {
      id: randomUUID(),
      kind: "item",
      catalogItemId: m?.item.id ?? null,
      nature: (m?.item.category as DraftLine["nature"]) ?? "main_oeuvre",
      label: [it.ref, it.label].filter(Boolean).join(" ").slice(0, 300),
      description: "",
      quantity: it.quantity || "1",
      unit: it.unit || m?.item.unit || "u",
      unitPrice: m ? price(m.item.unit_price4) : "0",
      unitCost: "",
      discountPercent: "",
      vatPercent: String((m?.item.vat_bp ?? 2000) / 100),
      estimated: !m,
      estimateNote: m ? "" : "Prix à compléter : aucun article proche dans le catalogue",
    };
    current.lines.push(line);
    lineMap[String(it.row)] = line.id;
  }
  await saveDraft(ctx, quoteId, { ...draft, sections }, draft.draftRevision);
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO public_tenders (org_id, quote_id, file_name, kind, rows, columns, line_map, matched, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ctx.orgId, quoteId, input.fileName.slice(0, 200), kind, JSON.stringify(rows), JSON.stringify(cols), JSON.stringify(lineMap), matched, ctx.userId],
  );
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "tender.import",
    target: r!.id,
    data: { kind, items: Object.keys(lineMap).length, matched },
    ip: ctx.ip,
  });
  return { id: r!.id, quoteId, kind, items: Object.keys(lineMap).length, matched };
}

export async function quoteTender(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) return null;
  const r = await one<{ id: string; file_name: string; kind: TenderKind; line_map: Record<string, string>; matched: number }>(
    ctx.db,
    "SELECT id, file_name, kind, line_map, matched FROM public_tenders WHERE quote_id=$1 AND org_id=$2 ORDER BY created_at DESC LIMIT 1",
    [quoteId, ctx.orgId],
  );
  return r ? { id: r.id, fileName: r.file_name, kind: r.kind, items: Object.keys(r.line_map).length, matched: Number(r.matched) } : null;
}

const cents = (euros: string) => {
  try {
    return Number(parseScaled(euros.replace(/\s/g, "").replace(",", ".") || "0", 2));
  } catch {
    return 0;
  }
};

/** Tableau de l'acheteur rempli avec les prix actuels du devis ; un poste retiré du devis reste vide. */
export async function exportTender(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Import introuvable");
  const t = await one<{ quote_id: string; file_name: string; kind: TenderKind; rows: string[][]; columns: TenderColumns; line_map: Record<string, string> }>(
    ctx.db,
    "SELECT quote_id, file_name, kind, rows, columns, line_map FROM public_tenders WHERE id=$1 AND org_id=$2",
    [id, ctx.orgId],
  );
  if (!t) throw notFound("Import introuvable");
  const draft = await getDraft(ctx, t.quote_id);
  const lines = new Map(draft.sections.flatMap((s) => s.lines).map((l) => [l.id, l]));
  const prices = new Map<number, { unitCents: number; quantity: string }>();
  for (const [row, lineId] of Object.entries(t.line_map)) {
    const l = lines.get(lineId);
    if (!l) continue;
    prices.set(Number(row), { unitCents: cents(l.unitPrice), quantity: t.kind === "dpgf" ? l.quantity.replace(",", ".") : "" });
  }
  const filled = fillTable(t.rows, t.columns, prices);
  const base = t.file_name.replace(/\.[a-z0-9]+$/i, "") || "marche";
  return { csv: toCsv(filled[0], filled.slice(1)), fileName: `${base}-rempli.csv` };
}
