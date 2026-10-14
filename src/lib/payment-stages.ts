/**
 * Paiement par étape validée en photo.
 *
 * Le devis accepté est découpé en étapes, chacune avec un avancement cumulé. L'artisan soumet une étape
 * avec des photos du chantier, le client la valide ou la conteste depuis son espace, et seule une étape
 * validée peut être facturée. La dernière étape atteint 100 % et passe par la facture de solde.
 */

import { z } from "zod";
import { parseScaled } from "@/lib/calc/decimal";

export const STAGE_STATUSES = {
  prevue: "Prévue",
  soumise: "À valider par le client",
  validee: "Validée par le client",
  contestee: "Contestée par le client",
} as const;
export type StageStatus = keyof typeof STAGE_STATUSES;

export const MAX_STAGES = 12;
export const MAX_STAGE_PHOTOS = 6;
export const STAGE_PHOTO_MAX_BYTES = 1_500_000;

export interface StagePlanRow {
  label: string;
  cumulativeBp: number;
}

export interface StageLike {
  id: string;
  position: number;
  status: StageStatus;
  invoiceId: string | null;
}

/** Lit un pourcentage saisi ("30", "33,5 %") en points de base. */
export function percentToBp(input: string): number | null {
  const raw = input.replace("%", "").trim();
  if (!raw) return null;
  try {
    const bp = Number(parseScaled(raw, 2));
    return Number.isFinite(bp) ? bp : null;
  } catch {
    return null;
  }
}

/**
 * Valide le plan d'étapes : libellés renseignés, avancements cumulés strictement croissants,
 * dernière étape à 100 %. Les lignes entièrement vides sont ignorées.
 */
export function parsePlan(rows: { label: string; percent: string }[]): { plan: StagePlanRow[]; error: string | null } {
  const filled = rows.map((r) => ({ label: r.label.trim(), percent: r.percent.trim() })).filter((r) => r.label || r.percent);
  if (!filled.length) return { plan: [], error: "Ajoutez au moins une étape" };
  if (filled.length > MAX_STAGES) return { plan: [], error: `${MAX_STAGES} étapes au plus` };
  const plan: StagePlanRow[] = [];
  let previous = 0;
  for (const [i, r] of filled.entries()) {
    const n = i + 1;
    if (r.label.length < 2) return { plan: [], error: `Étape ${n} : donnez un libellé` };
    if (r.label.length > 120) return { plan: [], error: `Étape ${n} : libellé trop long (120 caractères au plus)` };
    const bp = percentToBp(r.percent);
    if (bp === null || bp <= 0 || bp > 10000) return { plan: [], error: `Étape ${n} : avancement cumulé entre 0 et 100 %` };
    if (bp <= previous) return { plan: [], error: `Étape ${n} : l'avancement cumulé doit dépasser celui de l'étape précédente` };
    plan.push({ label: r.label, cumulativeBp: bp });
    previous = bp;
  }
  if (previous !== 10000) return { plan: [], error: "La dernière étape doit atteindre 100 % : c'est elle qui déclenche la facture de solde" };
  return { plan, error: null };
}

/** Étape en cours : la première qui n'est pas encore validée par le client. */
export function currentStage<T extends StageLike>(stages: T[]): T | null {
  return [...stages].sort((a, b) => a.position - b.position).find((s) => s.status !== "validee") ?? null;
}

/** L'artisan ne soumet que l'étape en cours, prévue ou contestée (nouvelles photos après correction). */
export function canSubmit(stages: StageLike[], stageId: string): boolean {
  const cur = currentStage(stages);
  return !!cur && cur.id === stageId && (cur.status === "prevue" || cur.status === "contestee");
}

/** Une étape se facture une fois validée, dans l'ordre : les étapes validées avant elle sont facturées. */
export function canInvoice(stages: StageLike[], stageId: string): boolean {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((s) => s.id === stageId);
  if (idx < 0) return false;
  const s = sorted[idx];
  return s.status === "validee" && !s.invoiceId && sorted.slice(0, idx).every((p) => !!p.invoiceId);
}

export const decisionSchema = z
  .object({
    decision: z.enum(["validee", "contestee"], { message: "Choisissez de valider ou de contester l'étape" }),
    comment: z.string().trim().max(1000, "Commentaire trop long (1 000 caractères au plus)").default(""),
  })
  .refine((d) => d.decision === "validee" || d.comment.length >= 5, { message: "Expliquez en quelques mots ce qui ne va pas", path: ["comment"] });

/** E-mail au client : une étape attend sa validation. */
export function stageMail(input: { orgName: string; quoteNumber: string; stageLabel: string; percent: string; url: string; note: string }) {
  return {
    subject: `${input.orgName} : étape à valider sur le devis ${input.quoteNumber}`,
    body:
      `Bonjour,\n\nL'étape "${input.stageLabel}" (avancement ${input.percent}) est terminée. ` +
      `Les photos du chantier sont dans votre espace client :\n${input.url}\n\n` +
      (input.note ? `Note de l'entreprise : ${input.note}\n\n` : "") +
      `Validez l'étape si l'avancement vous convient, ou contestez-la en expliquant ce qui ne va pas. ` +
      `Seule une étape validée est facturée.\n\n${input.orgName}`,
  };
}
