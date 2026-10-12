/** Catalogue de produits et prestations (module D). */

import { z } from "zod";
import type { Queryable } from "@/lib/db";
import { num, numOrNull, one } from "@/lib/db";
import { parseScaled } from "@/lib/calc/decimal";
import { bpToInput, price4ToInput } from "@/lib/calc/format";
import { parseCsv, toCsv } from "@/lib/csv";
import { badRequest, conflict, notFound } from "@/lib/http";
import { fuzzyFilter } from "@/lib/fuzzy";
import { LIBRARY, LIBRARY_DATE, LIBRARY_NOTE, type LibraryTrade } from "@/lib/library";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { recomputeOuvrage, recomputeParentsOf } from "./ouvrages";

export const CATEGORIES = {
  materiau: "Matériaux",
  main_oeuvre: "Main-d'œuvre",
  deplacement: "Déplacement",
  sous_traitance: "Sous-traitance",
  forfait: "Forfait",
  autre: "Autre",
} as const;
export type Category = keyof typeof CATEGORIES;

export const UNITS = ["u", "h", "j", "m²", "m³", "ml", "m", "kg", "t", "l", "forfait", "lot", "ens"] as const;

export interface CatalogItem {
  id: string;
  org_id: string;
  reference: string;
  name: string;
  description: string;
  category: Category;
  subcategory: string;
  unit: string;
  unit_cost4: number | null;
  hourly_cost4: number | null;
  unit_price4: number;
  vat_bp: number;
  supplier: string;
  duration_minutes: number | null;
  price_valid_until: string | null;
  active: boolean;
  favorite: boolean;
  usage_count: number;
  source: string;
  source_note: string;
  kind: "simple" | "ouvrage";
  composition_text: string;
  /** Étiquettes libres (en minuscules) */
  tags: string[];
  last_used_at: Date | null;
  updated_at: Date;
  updated_by_name?: string | null;
}

export function mapItem(r: Record<string, unknown>): CatalogItem {
  return {
    ...(r as unknown as CatalogItem),
    unit_cost4: numOrNull(r.unit_cost4),
    hourly_cost4: numOrNull(r.hourly_cost4),
    unit_price4: num(r.unit_price4),
    vat_bp: num(r.vat_bp),
    usage_count: num(r.usage_count),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    last_used_at: (r.last_used_at as Date | null) ?? null,
    duration_minutes: numOrNull(r.duration_minutes),
    price_valid_until: r.price_valid_until ? toIsoDate(r.price_valid_until) : null,
  };
}

function toIsoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

const decimalText = (label: string, scale: number, required: boolean) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      const s = v === undefined || v === null ? "" : String(v).trim();
      if (s === "") {
        if (required) ctx.addIssue({ code: "custom", message: `${label} requis` });
        return null;
      }
      try {
        const n = parseScaled(s, scale);
        if (n < 0n) {
          ctx.addIssue({ code: "custom", message: `${label} ne peut pas être négatif` });
          return null;
        }
        return Number(n);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: `${label} : ${(e as Error).message}` });
        return null;
      }
    });

export const itemSchema = z.object({
  reference: z.string().trim().max(40).optional().default(""),
  name: z.string().trim().min(1, "Le nom est requis").max(200),
  description: z.string().trim().max(4000).optional().default(""),
  category: z.enum(["materiau", "main_oeuvre", "deplacement", "sous_traitance", "forfait", "autre"]).default("main_oeuvre"),
  subcategory: z.string().trim().max(80).optional().default(""),
  unit: z.string().trim().min(1).max(20).default("u"),
  unit_cost: decimalText("Coût d'achat", 4, false),
  hourly_cost: decimalText("Coût horaire", 4, false),
  unit_price: decimalText("Prix de vente", 4, true),
  vat_percent: decimalText("Taux de TVA", 2, true),
  supplier: z.string().trim().max(120).optional().default(""),
  duration_minutes: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  price_valid_until: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  active: z.boolean().default(true),
  favorite: z.boolean().default(false),
  /** Étiquettes : liste ou texte séparé par des virgules */
  tags: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? undefined : normalizeTags(v))),
});

/** Étiquettes nettoyées : minuscules, sans doublon, 12 au plus de 30 caractères. */
export function normalizeTags(v: string | string[]): string[] {
  const list = Array.isArray(v) ? v : v.split(/[,;|]/);
  const out: string[] = [];
  for (const t of list) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 12);
}

export type ItemInput = z.input<typeof itemSchema>;

function parseItem(raw: unknown) {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, parsed.error.issues);
  const d = parsed.data;
  if (d.vat_percent !== null && d.vat_percent > 10000) throw badRequest("Taux de TVA invalide");
  return d;
}

async function nextReference(q: Queryable, orgId: string, category: string): Promise<string> {
  const prefix = { materiau: "MAT", main_oeuvre: "MO", deplacement: "DEP", sous_traitance: "ST", forfait: "FOR", autre: "DIV" }[category] ?? "ART";
  const rows = await q.query<{ reference: string }>("SELECT reference FROM catalog_items WHERE org_id=$1 AND reference LIKE $2", [
    orgId,
    prefix + "-%",
  ]);
  let max = 0;
  for (const r of rows) {
    const n = Number(r.reference.slice(prefix.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export async function createItem(ctx: Ctx, raw: unknown, q: Queryable = ctx.db, extra: { source?: string; sourceNote?: string } = {}) {
  requireWritable(ctx);
  const d = parseItem(raw);
  const reference = d.reference || (await nextReference(q, ctx.orgId, d.category));
  const exists = await one(q, "SELECT 1 FROM catalog_items WHERE org_id=$1 AND reference=$2", [ctx.orgId, reference]);
  if (exists) throw conflict(`La référence ${reference} existe déjà`);
  const row = await one<{ id: string }>(
    q,
    `INSERT INTO catalog_items (org_id, reference, name, description, category, subcategory, unit, unit_cost4, hourly_cost4,
       unit_price4, vat_bp, supplier, duration_minutes, price_valid_until, active, favorite, source, source_note, updated_by, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
    [
      ctx.orgId,
      reference,
      d.name,
      d.description,
      d.category,
      d.subcategory,
      d.unit,
      d.unit_cost,
      d.hourly_cost,
      d.unit_price,
      d.vat_percent,
      d.supplier,
      d.duration_minutes ?? null,
      d.price_valid_until,
      d.active,
      d.favorite,
      extra.source ?? "user",
      extra.sourceNote ?? "",
      ctx.userId,
      d.tags ?? [],
    ],
  );
  return row!.id;
}

export async function getItem(ctx: Ctx, id: string): Promise<CatalogItem> {
  const r = await one(
    ctx.db,
    "SELECT c.*, u.name AS updated_by_name FROM catalog_items c LEFT JOIN users u ON u.id=c.updated_by WHERE c.id=$1 AND c.org_id=$2",
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Prestation introuvable");
  return mapItem(r);
}

export async function updateItem(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  const d = parseItem(raw);
  await ctx.db.transaction(async (tx) => {
    const cur = await one(tx, "SELECT * FROM catalog_items WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
    if (!cur) throw notFound("Prestation introuvable");
    const before = mapItem(cur);
    const reference = d.reference || before.reference;
    if (reference !== before.reference) {
      const exists = await one(tx, "SELECT 1 FROM catalog_items WHERE org_id=$1 AND reference=$2", [ctx.orgId, reference]);
      if (exists) throw conflict(`La référence ${reference} existe déjà`);
    }
    await tx.query(
      `UPDATE catalog_items SET reference=$3, name=$4, description=$5, category=$6, subcategory=$7, unit=$8, unit_cost4=$9,
         hourly_cost4=$10, unit_price4=$11, vat_bp=$12, supplier=$13, duration_minutes=$14, price_valid_until=$15, active=$16,
         favorite=$17, updated_by=$18, tags=coalesce($19, tags), updated_at=now()
       WHERE id=$1 AND org_id=$2`,
      [
        id,
        ctx.orgId,
        reference,
        d.name,
        d.description,
        d.category,
        d.subcategory,
        d.unit,
        d.unit_cost,
        d.hourly_cost,
        d.unit_price,
        d.vat_percent,
        d.supplier,
        d.duration_minutes ?? null,
        d.price_valid_until,
        d.active,
        d.favorite,
        ctx.userId,
        d.tags ?? null,
      ],
    );
    if (before.unit_price4 !== d.unit_price || before.unit_cost4 !== d.unit_cost) {
      await tx.query(
        "INSERT INTO catalog_price_history (org_id, item_id, old_price4, new_price4, old_cost4, new_cost4, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [ctx.orgId, id, before.unit_price4, d.unit_price, before.unit_cost4, d.unit_cost, ctx.userId],
      );
    }
    // Le prix d'un ouvrage vient de ses composants ; ceux qui utilisent cette prestation suivent son nouveau prix.
    if (before.kind === "ouvrage") await recomputeOuvrage(tx, ctx.orgId, id, ctx.userId);
    else await recomputeParentsOf(tx, ctx.orgId, [id], ctx.userId);
  });
}

export async function priceHistory(ctx: Ctx, itemId: string) {
  const rows = await ctx.db.query(
    `SELECT h.*, u.name AS user_name FROM catalog_price_history h LEFT JOIN users u ON u.id=h.user_id
     WHERE h.item_id=$1 AND h.org_id=$2 ORDER BY h.created_at DESC`,
    [itemId, ctx.orgId],
  );
  return rows.map((r) => ({
    created_at: r.created_at as Date,
    user_name: (r.user_name as string | null) ?? "",
    old_price4: numOrNull(r.old_price4),
    new_price4: numOrNull(r.new_price4),
    old_cost4: numOrNull(r.old_cost4),
    new_cost4: numOrNull(r.new_cost4),
  }));
}

export async function duplicateItem(ctx: Ctx, id: string) {
  const it = await getItem(ctx, id);
  return createItem(ctx, {
    ...itemToInput(it),
    reference: "",
    name: it.name + " (copie)",
    favorite: false,
  });
}

export function itemToInput(it: CatalogItem): ItemInput {
  return {
    reference: it.reference,
    name: it.name,
    description: it.description,
    category: it.category,
    subcategory: it.subcategory,
    unit: it.unit,
    unit_cost: it.unit_cost4 === null ? "" : price4ToInput(it.unit_cost4),
    hourly_cost: it.hourly_cost4 === null ? "" : price4ToInput(it.hourly_cost4),
    unit_price: price4ToInput(it.unit_price4),
    vat_percent: bpToInput(it.vat_bp),
    supplier: it.supplier,
    duration_minutes: it.duration_minutes,
    price_valid_until: it.price_valid_until,
    active: it.active,
    favorite: it.favorite,
    tags: it.tags,
  };
}

export async function setItemFlags(ctx: Ctx, id: string, flags: { active?: boolean; favorite?: boolean }) {
  requireWritable(ctx);
  await getItem(ctx, id);
  await ctx.db.query(
    "UPDATE catalog_items SET active=coalesce($3, active), favorite=coalesce($4, favorite), updated_at=now() WHERE id=$1 AND org_id=$2",
    [id, ctx.orgId, flags.active ?? null, flags.favorite ?? null],
  );
}

export async function searchItems(
  ctx: Ctx,
  opts: {
    q?: string;
    category?: string;
    tag?: string;
    includeArchived?: boolean;
    favorites?: boolean;
    sort?: "name" | "usage" | "recent" | "used";
    limit?: number;
  } = {},
) {
  const params: unknown[] = [ctx.orgId];
  const where = ["c.org_id=$1"];
  if (!opts.includeArchived) where.push("c.active");
  if (opts.favorites) where.push("c.favorite");
  if (opts.category) {
    params.push(opts.category);
    where.push(`c.category=$${params.length}`);
  }
  if (opts.tag) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(c.tags)`);
  }
  const order =
    opts.sort === "usage"
      ? "c.favorite DESC, c.usage_count DESC, c.name"
      : opts.sort === "recent"
        ? "c.updated_at DESC"
        : opts.sort === "used"
          ? "c.last_used_at DESC NULLS LAST, c.name"
          : "c.category, c.subcategory, c.name";
  const limit = Math.min(opts.limit ?? 500, 2000);
  // Avec une recherche, le tri par pertinence tolérante aux fautes se fait sur tout le catalogue actif.
  const q = opts.q?.trim() ?? "";
  params.push(q ? 5000 : limit);
  const rows = await ctx.db.query(
    `SELECT c.*, u.name AS updated_by_name FROM catalog_items c LEFT JOIN users u ON u.id=c.updated_by
     WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT $${params.length}`,
    params,
  );
  const items = rows.map(mapItem);
  if (!q) return items;
  return fuzzyFilter(items, q, (it) => `${it.name} ${it.reference} ${it.subcategory} ${it.supplier} ${it.tags.join(" ")} ${it.description}`).slice(0, limit);
}

/** Mise à jour groupée : variation en pourcentage du prix de vente (ex. "3" ou "-2,5"). */
export async function bulkAdjustPrices(ctx: Ctx, ids: string[], percent: string) {
  requireWritable(ctx);
  let bp: bigint;
  try {
    bp = parseScaled(percent, 2);
  } catch {
    throw badRequest("Pourcentage invalide");
  }
  if (bp <= -10000n || bp > 100000n) throw badRequest("Variation hors limites");
  let count = 0;
  await ctx.db.transaction(async (tx) => {
    for (const id of ids) {
      const cur = await one(tx, "SELECT * FROM catalog_items WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
      if (!cur) continue;
      const it = mapItem(cur);
      if (it.kind === "ouvrage") continue;
      const raw = BigInt(it.unit_price4) * (10000n + bp);
      // Arrondi au centime (100 en dix-millièmes), moitié vers le haut.
      const next = Number(((raw / 10000n + 50n) / 100n) * 100n);
      await tx.query("UPDATE catalog_items SET unit_price4=$3, updated_by=$4, updated_at=now() WHERE id=$1 AND org_id=$2", [
        id,
        ctx.orgId,
        next,
        ctx.userId,
      ]);
      await tx.query(
        "INSERT INTO catalog_price_history (org_id, item_id, old_price4, new_price4, old_cost4, new_cost4, user_id) VALUES ($1,$2,$3,$4,$5,$5,$6)",
        [ctx.orgId, id, it.unit_price4, next, it.unit_cost4, ctx.userId],
      );
      count++;
    }
    await recomputeParentsOf(tx, ctx.orgId, ids, ctx.userId);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "catalog.bulk_price", data: { count, percent } });
  });
  return { updated: count };
}

const CSV_COLUMNS = [
  "reference",
  "name",
  "description",
  "category",
  "subcategory",
  "unit",
  "unit_cost",
  "hourly_cost",
  "unit_price",
  "vat_percent",
  "supplier",
  "duration_minutes",
  "price_valid_until",
  "active",
  "tags",
] as const;

export async function catalogCsv(ctx: Ctx): Promise<string> {
  const items = await searchItems(ctx, { includeArchived: true, limit: 2000 });
  return toCsv(
    [...CSV_COLUMNS],
    items.map((it) => {
      const i = itemToInput(it);
      return CSV_COLUMNS.map((c) =>
        c === "active" ? (it.active ? "oui" : "non") : c === "tags" ? it.tags.join("|") : String((i as Record<string, unknown>)[c] ?? ""),
      );
    }),
  );
}

export async function importCatalogCsv(ctx: Ctx, csv: string, dryRun: boolean) {
  requireWritable(ctx);
  const table = parseCsv(csv);
  if (table.length < 2) throw badRequest("Fichier vide");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const results: { line: number; ok: boolean; message: string; reference?: string }[] = [];
  const existing = new Set((await ctx.db.query<{ reference: string }>("SELECT reference FROM catalog_items WHERE org_id=$1", [ctx.orgId])).map((r) => r.reference));
  const toInsert: Record<string, unknown>[] = [];
  for (let i = 1; i < table.length; i++) {
    if (table[i].every((c) => !c.trim())) continue;
    const obj: Record<string, unknown> = {};
    header.forEach((h, j) => {
      const v = (table[i][j] ?? "").trim();
      if (h === "active") obj.active = !/^(non|false|0)$/i.test(v);
      else if (h === "duration_minutes") obj.duration_minutes = v ? Number(v) : null;
      else obj[h] = v;
    });
    const parsed = itemSchema.safeParse(obj);
    if (!parsed.success) {
      results.push({ line: i + 1, ok: false, message: parsed.error.issues.map((x) => x.message).join(", ") });
      continue;
    }
    const ref = String(obj.reference ?? "");
    if (ref && existing.has(ref)) {
      results.push({ line: i + 1, ok: false, message: `Référence ${ref} déjà présente`, reference: ref });
      continue;
    }
    if (ref) existing.add(ref);
    toInsert.push(obj);
    results.push({ line: i + 1, ok: true, message: "Prêt à importer", reference: ref });
  }
  if (!dryRun) {
    await ctx.db.transaction(async (tx) => {
      for (const obj of toInsert) await createItem(ctx, obj, tx);
    });
  }
  return { results, imported: dryRun ? 0 : toInsert.length };
}

/** Ajoute une bibliothèque de prestations fournie par le logiciel (tarifs indicatifs). */
export async function installLibrary(ctx: Ctx, trade: LibraryTrade) {
  requireWritable(ctx);
  const lib = LIBRARY[trade];
  if (!lib) throw badRequest("Bibliothèque inconnue");
  let added = 0;
  await ctx.db.transaction(async (tx) => {
    for (const it of lib.items) {
      const exists = await one(tx, "SELECT 1 FROM catalog_items WHERE org_id=$1 AND lower(name)=lower($2)", [ctx.orgId, it.name]);
      if (exists) continue;
      await createItem(ctx, { ...it, reference: "" }, tx, {
        source: "library",
        sourceNote: `${LIBRARY_NOTE} Mise à jour : ${LIBRARY_DATE}.`,
      });
      added++;
    }
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "catalog.library", data: { trade, added } });
  });
  return { added };
}

export async function incrementUsage(q: Queryable, orgId: string, ids: string[]) {
  if (ids.length === 0) return;
  await q.query("UPDATE catalog_items SET usage_count = usage_count + 1, last_used_at = now() WHERE org_id=$1 AND id = ANY($2::uuid[])", [orgId, ids]);
}

/** Toutes les étiquettes utilisées dans le catalogue, avec leur nombre de prestations. */
export async function listCatalogTags(ctx: Ctx): Promise<{ tag: string; count: number }[]> {
  const rows = await ctx.db.query<{ tag: string; n: unknown }>(
    "SELECT t AS tag, count(*) AS n FROM catalog_items, unnest(tags) AS t WHERE org_id=$1 AND active GROUP BY t ORDER BY 2 DESC, 1",
    [ctx.orgId],
  );
  return rows.map((r) => ({ tag: r.tag, count: num(r.n) }));
}
