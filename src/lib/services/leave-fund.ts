/**
 * Déclarations à la caisse de congés payés du bâtiment : salariés, heures pointées, absences et salaires
 * bruts du mois, droits acquis et cotisation, puis export pour la saisie sur le site de la caisse.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, conflict } from "@/lib/http";
import { absenceDays, acquiredDays, contributionCents, isPeriod, previousPeriod } from "@/lib/leave-fund";
import { toCsv } from "@/lib/csv";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { eurosToCents } from "./pricing";

export interface LeaveFundSettings {
  fundName: string;
  memberNumber: string;
  /** Taux de cotisation communiqué par la caisse, en points de base */
  rateBp: number;
}

export function readLeaveFund(raw: unknown): LeaveFundSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rate = Number(r.rateBp);
  return {
    fundName: typeof r.fundName === "string" ? r.fundName : "",
    memberNumber: typeof r.memberNumber === "string" ? r.memberNumber : "",
    rateBp: Number.isInteger(rate) && rate >= 0 && rate <= 5000 ? rate : 0,
  };
}

export interface DeclarationLine {
  userId: string;
  name: string;
  qualification: string;
  minutes: number;
  workedDays: number;
  leaveDays: number;
  sickDays: number;
  otherAbsenceDays: number;
  acquiredDays: number;
  grossCents: number | null;
}

export async function getLeaveFundSettings(ctx: Ctx) {
  const r = await one<{ leave_fund: unknown }>(ctx.db, "SELECT leave_fund FROM organizations WHERE id=$1", [ctx.orgId]);
  return readLeaveFund(r?.leave_fund);
}

const settingsSchema = z.object({
  fundName: z.string().trim().max(120).default(""),
  memberNumber: z.string().trim().max(40).default(""),
  rate: z.string().trim().min(1, "Indiquez le taux de cotisation communiqué par votre caisse"),
});

export async function saveLeaveFundSettings(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  const p = settingsSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const rate = Number(p.data.rate.replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) throw badRequest("Taux de cotisation entre 0 et 50 %");
  const s: LeaveFundSettings = { fundName: p.data.fundName, memberNumber: p.data.memberNumber, rateBp: Math.round(rate * 100) };
  await ctx.db.query("UPDATE organizations SET leave_fund=$2 WHERE id=$1", [ctx.orgId, JSON.stringify(s)]);
  return s;
}

/** Salariés de la période : membres de l'équipe hors chef d'entreprise, gérant et comptable, avec pointage et absences. */
async function computeLines(ctx: Ctx, period: string): Promise<DeclarationLine[]> {
  const first = `${period}-01`;
  const last = `${period}-${String(new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).getUTCDate()).padStart(2, "0")}`;
  const members = await ctx.db.query<{ user_id: string; name: string; qualification: string }>(
    `SELECT m.user_id, u.name, m.qualification FROM memberships m JOIN users u ON u.id=m.user_id
     WHERE m.org_id=$1 AND m.role <> 'owner' AND coalesce(m.job_function, 'ouvrier') NOT IN ('gerant', 'comptable') ORDER BY u.name`,
    [ctx.orgId],
  );
  const time = await ctx.db.query<{ user_id: string; minutes: unknown; days: unknown }>(
    `SELECT user_id, sum(minutes) AS minutes, count(DISTINCT work_date) AS days FROM time_entries
     WHERE org_id=$1 AND status <> 'refuse' AND to_char(work_date, 'YYYY-MM')=$2 GROUP BY user_id`,
    [ctx.orgId, period],
  );
  const abs = await ctx.db.query<{ user_id: string; kind: string; start_date: unknown; end_date: unknown }>(
    "SELECT user_id, kind, start_date, end_date FROM member_absences WHERE org_id=$1 AND start_date <= $3::date AND end_date >= $2::date",
    [ctx.orgId, first, last],
  );
  const d = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  return members.map((m) => {
    const t = time.find((x) => x.user_id === m.user_id);
    const mine = abs.filter((a) => a.user_id === m.user_id);
    const count = (kinds: string[]) =>
      absenceDays(
        period,
        mine.filter((a) => kinds.includes(a.kind)).map((a) => ({ start: d(a.start_date), end: d(a.end_date) })),
      );
    const minutes = num(t?.minutes);
    return {
      userId: m.user_id,
      name: m.name,
      qualification: m.qualification,
      minutes,
      workedDays: num(t?.days),
      leaveDays: count(["conges", "rtt"]),
      sickDays: count(["maladie"]),
      otherAbsenceDays: count(["formation", "autre"]),
      acquiredDays: acquiredDays(minutes),
      grossCents: null,
    };
  });
}

function totals(lines: DeclarationLine[], rateBp: number) {
  const gross = lines.reduce((a, l) => a + (l.grossCents ?? 0), 0);
  return { totalGrossCents: gross, contributionCents: contributionCents(gross, rateBp) };
}

/**
 * Déclaration d'une période : celle enregistrée, sinon un brouillon calculé dont les salaires bruts
 * reprennent ceux de la déclaration du mois précédent.
 */
export async function getDeclaration(ctx: Ctx, period: string) {
  requirePermission(ctx, "staff");
  if (!isPeriod(period)) throw badRequest("Période invalide");
  const settings = await getLeaveFundSettings(ctx);
  const saved = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM leave_declarations WHERE org_id=$1 AND period=$2", [ctx.orgId, period]);
  if (saved) {
    const lines = saved.lines as DeclarationLine[];
    return {
      period,
      saved: true,
      status: saved.status as "preparee" | "transmise",
      sentAt: saved.sent_at ? String(saved.sent_at instanceof Date ? saved.sent_at.toISOString() : saved.sent_at).slice(0, 10) : null,
      rateBp: Number(saved.rate_bp),
      lines,
      totalGrossCents: num(saved.total_gross_cents),
      contributionCents: num(saved.contribution_cents),
      settings,
    };
  }
  const lines = await computeLines(ctx, period);
  const prev = await one<{ lines: unknown }>(ctx.db, "SELECT lines FROM leave_declarations WHERE org_id=$1 AND period=$2", [ctx.orgId, previousPeriod(period)]);
  const prevGross = new Map(((prev?.lines as DeclarationLine[] | undefined) ?? []).map((l) => [l.userId, l.grossCents]));
  for (const l of lines) l.grossCents = prevGross.get(l.userId) ?? null;
  return { period, saved: false, status: "preparee" as const, sentAt: null, rateBp: settings.rateBp, lines, ...totals(lines, settings.rateBp), settings };
}

/** Enregistre la déclaration avec les salaires bruts saisis ; les heures et absences sont recalculées. */
export async function saveDeclaration(ctx: Ctx, period: string, gross: Record<string, string>) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  if (!isPeriod(period)) throw badRequest("Période invalide");
  const settings = await getLeaveFundSettings(ctx);
  if (!settings.rateBp) throw badRequest("Indiquez d'abord le taux de cotisation de votre caisse");
  const existing = await one<{ status: string }>(ctx.db, "SELECT status FROM leave_declarations WHERE org_id=$1 AND period=$2", [ctx.orgId, period]);
  if (existing?.status === "transmise") throw conflict("Déclaration déjà transmise à la caisse : elle ne se modifie plus");
  const lines = await computeLines(ctx, period);
  for (const l of lines) {
    const v = (gross[l.userId] ?? "").trim();
    if (!v) throw badRequest(`Salaire brut manquant pour ${l.name}`);
    try {
      l.grossCents = eurosToCents(v.replace(/[\s€]/g, ""), `Salaire brut de ${l.name}`);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  }
  const t = totals(lines, settings.rateBp);
  await ctx.db.query(
    `INSERT INTO leave_declarations (org_id, period, rate_bp, lines, total_gross_cents, contribution_cents, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (org_id, period) DO UPDATE SET rate_bp=$3, lines=$4, total_gross_cents=$5, contribution_cents=$6, updated_at=now()`,
    [ctx.orgId, period, settings.rateBp, JSON.stringify(lines), t.totalGrossCents, t.contributionCents, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "leave_fund.save", target: period, ip: ctx.ip });
  return t;
}

export async function markDeclarationSent(ctx: Ctx, period: string) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  const r = await ctx.db.query(
    "UPDATE leave_declarations SET status='transmise', sent_at=now(), updated_at=now() WHERE org_id=$1 AND period=$2 AND status='preparee' RETURNING id",
    [ctx.orgId, period],
  );
  if (!r.length) throw conflict("Enregistrez la déclaration avant de la marquer transmise");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "leave_fund.sent", target: period, ip: ctx.ip });
}

/** Tableau à reporter sur le site de la caisse, une ligne par salarié. */
export async function declarationCsv(ctx: Ctx, period: string) {
  const d = await getDeclaration(ctx, period);
  if (!d.saved) throw conflict("Enregistrez la déclaration avant de l'exporter");
  const euros = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
  return toCsv(
    [
      "Période",
      "Salarié",
      "Qualification",
      "Heures",
      "Jours travaillés",
      "Congés pris",
      "Maladie",
      "Autres absences",
      "Jours acquis",
      "Salaire brut",
      "Cotisation",
    ],
    d.lines.map((l) => [
      period,
      l.name,
      l.qualification,
      (l.minutes / 60).toFixed(2).replace(".", ","),
      String(l.workedDays),
      String(l.leaveDays),
      String(l.sickDays),
      String(l.otherAbsenceDays),
      String(l.acquiredDays).replace(".", ","),
      euros(l.grossCents),
      euros(contributionCents(l.grossCents ?? 0, d.rateBp)),
    ]),
  );
}
