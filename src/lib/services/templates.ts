/**
 * Modèles de devis propres à l'entreprise (salle de bain type, toiture type...).
 *
 * Un modèle conserve les sections, les lignes et les conditions d'un devis, sans
 * client ni adresse de chantier. Créer un devis depuis un modèle recopie tout avec
 * de nouveaux identifiants : modifier le devis ne modifie jamais le modèle.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { createQuote, draftSchema, getDraft, saveDraft } from "./quotes";

export interface TemplateData {
  title: string;
  description: string;
  validityDays: number;
  paymentTerms: string;
  specialConditions: string;
  depositPercent: string;
  estimatedDuration: string;
  globalDiscount: string;
  sections: z.infer<typeof draftSchema>["sections"];
}

export interface QuoteTemplate {
  id: string;
  name: string;
  description: string;
  line_count: number;
  usage_count: number;
  updated_at: Date;
}

const nameSchema = z.string().trim().min(1, "Donnez un nom au modèle").max(120, "Nom trop long (120 caractères au plus)");

function requireTemplates(ctx: Ctx) {
  if (!ctx.entitlements.plan.features.templates) {
    throw badRequest("Les modèles de devis sont inclus dans les offres Professionnel et Entreprise");
  }
}

export async function listTemplates(ctx: Ctx): Promise<QuoteTemplate[]> {
  return ctx.db.query<QuoteTemplate>(
    "SELECT id, name, description, line_count, usage_count, updated_at FROM quote_templates WHERE org_id=$1 ORDER BY usage_count DESC, name",
    [ctx.orgId],
  );
}

/** Enregistre le brouillon actuel d'un devis comme modèle. */
export async function saveQuoteAsTemplate(ctx: Ctx, quoteId: string, input: { name: string; description?: string }) {
  requireWritable(ctx);
  requireTemplates(ctx);
  const name = nameSchema.parse(input.name);
  const d = await getDraft(ctx, quoteId);
  const sections = d.sections.map((s) => ({
    ...s,
    lines: s.lines.map(({ measure: _measure, ...l }) => ({ ...l, internalNote: "" })),
  }));
  const lineCount = sections.reduce((n, s) => n + s.lines.length, 0);
  if (lineCount === 0) throw badRequest("Ce devis ne contient aucune ligne à réutiliser");
  const data: TemplateData = {
    title: d.title,
    description: d.description,
    validityDays: d.validityDays,
    paymentTerms: d.paymentTerms,
    specialConditions: d.specialConditions,
    depositPercent: d.depositPercent,
    estimatedDuration: d.estimatedDuration,
    globalDiscount: d.globalDiscount,
    sections,
  };
  const exists = await one(ctx.db, "SELECT 1 FROM quote_templates WHERE org_id=$1 AND lower(name)=lower($2)", [ctx.orgId, name]);
  if (exists) throw conflict("Un modèle porte déjà ce nom");
  const row = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO quote_templates (org_id, name, description, data, line_count, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [ctx.orgId, name, String(input.description ?? "").slice(0, 500), JSON.stringify(data), lineCount, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "template.create", target: row!.id, ip: ctx.ip });
  return row!.id;
}

/** Nouveau devis à partir d'un modèle, pour un client facultatif. */
export async function createQuoteFromTemplate(ctx: Ctx, templateId: string, init: { customerId?: string | null; title?: string } = {}) {
  requireWritable(ctx);
  const t = await one<{ data: TemplateData }>(ctx.db, "SELECT data FROM quote_templates WHERE id=$1 AND org_id=$2", [templateId, ctx.orgId]);
  if (!t) throw notFound("Modèle introuvable");
  const id = await createQuote(ctx, { customerId: init.customerId ?? null, title: init.title || t.data.title, description: t.data.description });
  const fresh = await getDraft(ctx, id);
  const sections = t.data.sections.map((s) => ({ ...s, id: randomUUID(), lines: s.lines.map((l) => ({ ...l, id: randomUUID() })) }));
  await saveDraft(
    ctx,
    id,
    {
      ...fresh,
      title: init.title || t.data.title,
      description: t.data.description,
      validityDays: t.data.validityDays || fresh.validityDays,
      paymentTerms: t.data.paymentTerms || fresh.paymentTerms,
      specialConditions: t.data.specialConditions,
      depositPercent: t.data.depositPercent || fresh.depositPercent,
      estimatedDuration: t.data.estimatedDuration,
      globalDiscount: t.data.globalDiscount,
      sections,
    },
    fresh.draftRevision,
  );
  await ctx.db.query("UPDATE quote_templates SET usage_count=usage_count+1 WHERE id=$1", [templateId]);
  return id;
}

export async function renameTemplate(ctx: Ctx, id: string, input: { name: string; description?: string }) {
  requireWritable(ctx);
  const name = nameSchema.parse(input.name);
  const clash = await one(ctx.db, "SELECT 1 FROM quote_templates WHERE org_id=$1 AND lower(name)=lower($2) AND id<>$3", [ctx.orgId, name, id]);
  if (clash) throw conflict("Un modèle porte déjà ce nom");
  const r = await ctx.db.query("UPDATE quote_templates SET name=$3, description=$4, updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING id", [
    id,
    ctx.orgId,
    name,
    String(input.description ?? "").slice(0, 500),
  ]);
  if (!r.length) throw notFound("Modèle introuvable");
}

export async function deleteTemplate(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const r = await ctx.db.query("DELETE FROM quote_templates WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Modèle introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "template.delete", target: id, ip: ctx.ip });
}

export async function templateCount(ctx: Ctx) {
  return num((await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM quote_templates WHERE org_id=$1", [ctx.orgId]))?.n);
}
