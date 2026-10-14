/** Devis préparé à partir d'un CCTP : un lot du cahier des charges devient un lot du devis, chaque article une ligne. */

import { randomUUID } from "node:crypto";
import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { readSpec, SpecError, specParagraphs } from "@/lib/spec-reader";
import { labelSimilarity, MATCH_THRESHOLD } from "@/lib/tender";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import type { DraftLine, DraftSection } from "./quote-types";
import { createQuote, getDraft, saveDraft } from "./quotes";

export const SPEC_MAX_BYTES = 10_000_000;
const MAX_ARTICLES = 800;

export async function importSpec(ctx: Ctx, input: { bytes: Uint8Array; fileName: string; customerId?: string | null; title?: string }) {
  requireWritable(ctx);
  if (input.bytes.length > SPEC_MAX_BYTES) throw badRequest("Fichier trop lourd (10 Mo au plus)");
  let reading;
  try {
    reading = readSpec(await specParagraphs(input.bytes, input.fileName));
  } catch (e) {
    if (e instanceof SpecError) throw badRequest(e.message);
    throw e;
  }
  const count = reading.lots.reduce((s, l) => s + l.articles.length, 0);
  if (!count) throw badRequest("Aucun article numéroté trouvé : le CCTP doit numéroter ses articles (3.1, 3.2...)");
  if (count > MAX_ARTICLES) throw badRequest(`${MAX_ARTICLES} articles au plus par import`);
  const catalog = (
    await ctx.db.query<{ id: string; name: string; unit: string; unit_price4: unknown; vat_bp: number; category: string }>(
      "SELECT id, name, unit, unit_price4, vat_bp, category FROM catalog_items WHERE org_id=$1 AND active",
      [ctx.orgId],
    )
  ).map((c) => ({ ...c, unit_price4: num(c.unit_price4) }));

  const quoteId = await createQuote(ctx, { customerId: input.customerId || null, title: input.title?.trim() || input.fileName.replace(/\.[a-z0-9]+$/i, "") });
  const draft = await getDraft(ctx, quoteId);
  let matched = 0;
  let withQuantity = 0;
  const sections: DraftSection[] = reading.lots.map((lot) => ({
    id: randomUUID(),
    title: [lot.ref ? `Lot ${lot.ref}` : "", lot.title].filter(Boolean).join(" ").slice(0, 200),
    description: "",
    lines: lot.articles.map((a): DraftLine => {
      let best: { c: (typeof catalog)[number]; score: number } | null = null;
      for (const c of catalog) {
        const score = labelSimilarity(a.title, c.name, a.unit, c.unit);
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { c, score };
      }
      if (best) matched++;
      const quantityFound = !(a.quantity === "1" && a.unit === "ens");
      if (quantityFound) withQuantity++;
      const notes = [best ? "" : "Prix à compléter : aucun article proche dans le catalogue", quantityFound ? "" : "Quantité non indiquée dans le CCTP"].filter(
        Boolean,
      );
      return {
        id: randomUUID(),
        kind: "item",
        catalogItemId: best?.c.id ?? null,
        nature: (best?.c.category as DraftLine["nature"]) ?? "main_oeuvre",
        label: `${a.ref} ${a.title}`.slice(0, 300),
        description: a.description.slice(0, 1000),
        quantity: a.quantity,
        unit: a.unit,
        unitPrice: best ? (best.c.unit_price4 / 10000).toFixed(2) : "0",
        unitCost: "",
        discountPercent: "",
        vatPercent: String((best?.c.vat_bp ?? 2000) / 100),
        estimated: notes.length > 0,
        estimateNote: notes.join(". "),
        internalNote: `Article ${a.ref} du CCTP « ${input.fileName.slice(0, 120)} »`,
      };
    }),
  }));
  if (reading.references.length) {
    sections[0].lines.unshift({
      id: randomUUID(),
      kind: "note",
      catalogItemId: null,
      nature: "autre",
      label: `Travaux exécutés conformément aux documents cités par le CCTP : ${reading.references.slice(0, 30).join(", ")}.`.slice(0, 300),
      description: "",
      quantity: "",
      unit: "",
      unitPrice: "",
      unitCost: "",
      discountPercent: "",
      vatPercent: "",
      estimated: false,
      estimateNote: "",
    });
  }
  await saveDraft(ctx, quoteId, { ...draft, sections }, draft.draftRevision);
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "spec.import",
    target: quoteId,
    data: { file: input.fileName.slice(0, 200), lots: sections.length, articles: count, matched },
    ip: ctx.ip,
  });
  return { quoteId, lots: sections.length, articles: count, matched, withQuantity, references: reading.references };
}
