/** Moteur de règles par pays : versions publiées par l'administration, appliquées à leur date sans nouvelle version du logiciel. */

import type { Queryable } from "@/lib/db";
import { badRequest, forbidden, isUuid, notFound } from "@/lib/http";
import { applyRuleVersions, COUNTRIES, countryOf, isCountryCode, nextRuleVersion, parseVatList, type RuleVersion } from "@/lib/country-rules";
import { requirePlatformAdmin } from "./admin";
import type { Ctx } from "./context";
import { audit } from "./context";
import { parisDate } from "./quotes";

type Row = { id: string; country: string; effective_from: string | Date; vat_options: string[]; mentions: string[]; note: string; created_at: Date };

const day = (v: string | Date) => (typeof v === "string" ? v.slice(0, 10) : parisDate(v));

const toVersion = (r: Row): RuleVersion & { id: string; createdAt: Date } => ({
  id: String(r.id),
  country: countryOf(r.country),
  effectiveFrom: day(r.effective_from),
  vatOptions: r.vat_options ?? [],
  mentions: r.mentions ?? [],
  note: r.note,
  createdAt: r.created_at,
});

export async function ruleVersions(db: Queryable, country?: string) {
  const rows = country
    ? await db.query<Row>("SELECT * FROM country_rule_versions WHERE country=$1 ORDER BY effective_from DESC", [countryOf(country)])
    : await db.query<Row>("SELECT * FROM country_rule_versions ORDER BY country, effective_from DESC");
  return rows.map(toVersion);
}

/** Règles en vigueur pour le pays de l'entreprise à une date (aujourd'hui par défaut). */
export async function effectiveRules(db: Queryable, rawCountry: string | null | undefined, onDate = parisDate(new Date())) {
  const code = countryOf(rawCountry);
  return applyRuleVersions(code, await ruleVersions(db, code), onDate);
}

/** Vue d'ensemble pour l'administration : règles en vigueur, prochain changement et historique par pays. */
export async function countryRulesOverview(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  const all = await ruleVersions(ctx.db);
  const today = parisDate(new Date());
  return Object.values(COUNTRIES).map((c) => ({
    code: c.code,
    label: c.label,
    current: applyRuleVersions(c.code, all, today),
    next: nextRuleVersion(c.code, all, today),
    history: all.filter((v) => v.country === c.code),
  }));
}

export async function publishRuleVersion(ctx: Ctx, input: { country: string; effectiveFrom: string; vatRates: string; mentions: string; note: string }) {
  requirePlatformAdmin(ctx);
  if (!isCountryCode(input.country)) throw badRequest("Pays inconnu");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || Number.isNaN(Date.parse(input.effectiveFrom))) throw badRequest("Date d'entrée en vigueur invalide");
  const vat = parseVatList(input.vatRates);
  if (typeof vat === "string") throw badRequest(vat);
  const mentions = input.mentions
    .split("\n")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((m) => m.slice(0, 400));
  const note = input.note.trim().slice(0, 300);
  if (!note) throw badRequest("Indiquez la source du changement (texte de loi, circulaire)");
  const [row] = await ctx.db.query<{ id: string }>(
    `INSERT INTO country_rule_versions (country, effective_from, vat_options, mentions, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (country, effective_from) DO UPDATE SET vat_options=EXCLUDED.vat_options, mentions=EXCLUDED.mentions, note=EXCLUDED.note, created_by=EXCLUDED.created_by
     RETURNING id`,
    [input.country, input.effectiveFrom, JSON.stringify(vat.options), JSON.stringify(mentions), note, ctx.userId],
  );
  await audit(ctx.db, {
    userId: ctx.userId,
    action: "admin.country_rules",
    target: input.country,
    data: { effectiveFrom: input.effectiveFrom, vat: vat.options },
    ip: ctx.ip,
  });
  return String(row.id);
}

/** Seule une version pas encore en vigueur peut être retirée : les règles déjà appliquées restent dans l'historique. */
export async function deleteRuleVersion(ctx: Ctx, id: string) {
  requirePlatformAdmin(ctx);
  const [row] = isUuid(id) ? await ctx.db.query<Row>("SELECT * FROM country_rule_versions WHERE id=$1", [id]) : [];
  if (!row) throw notFound("Version introuvable");
  if (day(row.effective_from) <= parisDate(new Date()))
    throw forbidden("Cette version est déjà en vigueur : publiez-en une nouvelle plutôt que de la retirer.");
  await ctx.db.query("DELETE FROM country_rule_versions WHERE id=$1", [id]);
  await audit(ctx.db, {
    userId: ctx.userId,
    action: "admin.country_rules_delete",
    target: row.country,
    data: { effectiveFrom: day(row.effective_from) },
    ip: ctx.ip,
  });
}

/** Ce que l'entreprise doit savoir sur les règles de son pays : version en vigueur et prochain changement programmé. */
export async function countryRulesInfo(db: Queryable, rawCountry: string | null | undefined) {
  const code = countryOf(rawCountry);
  const versions = await ruleVersions(db, code);
  const today = parisDate(new Date());
  return { current: applyRuleVersions(code, versions, today), next: nextRuleVersion(code, versions, today) };
}
