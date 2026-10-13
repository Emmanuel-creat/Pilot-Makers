/** Parc de véhicules et d'outillage : contrôles périodiques, contrôle fait, rappels avant échéance. */

import { z } from "zod";
import { one, type Database } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { CHECK_REMINDER_DAYS, checkState, nextDue, type CheckState } from "@/lib/fleet";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { notifyOrg } from "./push";
import { parisDate } from "./quotes";

export interface Tool {
  id: string;
  name: string;
  reference: string;
}

export interface AssetCheck {
  id: string;
  assetType: "vehicle" | "tool";
  assetId: string;
  assetName: string;
  label: string;
  intervalMonths: number | null;
  dueDate: string | null;
  lastDone: string | null;
  note: string;
  state: CheckState;
}

export async function listTools(ctx: Ctx): Promise<Tool[]> {
  return ctx.db.query<Tool>("SELECT id, name, reference FROM org_tools WHERE org_id=$1 ORDER BY name", [ctx.orgId]);
}

export async function addTool(ctx: Ctx, raw: { name?: string; reference?: string }) {
  requireWritable(ctx);
  const name = String(raw.name ?? "").trim();
  if (!name || name.length > 80) throw badRequest("Nom de l'outil requis (80 caractères au plus)");
  const reference = String(raw.reference ?? "")
    .trim()
    .slice(0, 60);
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO org_tools (org_id, name, reference) VALUES ($1,$2,$3) RETURNING id", [ctx.orgId, name, reference]);
  return r!.id;
}

export async function deleteTool(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const r = await ctx.db.query("DELETE FROM org_tools WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Outil introuvable");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const checkSchema = z.object({
  asset: z.string().regex(/^(vehicle|tool):[0-9a-f-]{36}$/i, "Véhicule ou outil invalide"),
  label: z.string().trim().min(2, "Intitulé du contrôle requis").max(80, "Intitulé trop long"),
  intervalMonths: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 120), "Périodicité entre 1 et 120 mois")
    .default(""),
  dueDate: z
    .string()
    .trim()
    .refine((v) => v === "" || DATE.test(v), "Date d'échéance invalide")
    .default(""),
  note: z.string().trim().max(200, "Commentaire trop long").default(""),
});

export async function addCheck(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = checkSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  const [type, id] = d.asset.split(":") as ["vehicle" | "tool", string];
  const table = type === "vehicle" ? "org_vehicles" : "org_tools";
  if (!(await one(ctx.db, `SELECT 1 FROM ${table} WHERE id=$1 AND org_id=$2`, [id, ctx.orgId]))) throw notFound("Véhicule ou outil introuvable");
  if (!d.dueDate && !d.intervalMonths) throw badRequest("Indiquez la date du prochain contrôle ou sa périodicité");
  const due = d.dueDate || nextDue(parisDate(new Date()), Number(d.intervalMonths));
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO asset_checks (org_id, vehicle_id, tool_id, label, interval_months, due_date, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [ctx.orgId, type === "vehicle" ? id : null, type === "tool" ? id : null, d.label, d.intervalMonths ? Number(d.intervalMonths) : null, due, d.note],
  );
  return r!.id;
}

/** Contrôle effectué : la prochaine échéance suit la périodicité. */
export async function markCheckDone(ctx: Ctx, id: string, doneOn?: string) {
  requireWritable(ctx);
  const date = doneOn && DATE.test(doneOn) ? doneOn : parisDate(new Date());
  if (date > parisDate(new Date())) throw badRequest("La date du contrôle ne peut pas être dans le futur");
  const c = await one<{ interval_months: number | null }>(ctx.db, "SELECT interval_months FROM asset_checks WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!c) throw notFound("Contrôle introuvable");
  const due = nextDue(date, c.interval_months === null ? null : Number(c.interval_months));
  await ctx.db.query("UPDATE asset_checks SET last_done=$3, due_date=$4, reminded_for=NULL WHERE id=$1 AND org_id=$2", [id, ctx.orgId, date, due]);
  return due;
}

export async function deleteCheck(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const r = await ctx.db.query("DELETE FROM asset_checks WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Contrôle introuvable");
}

const iso = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

/** Contrôles du parc, les échéances les plus proches d'abord. */
export async function listChecks(ctx: Ctx, now = new Date()): Promise<AssetCheck[]> {
  const today = parisDate(now);
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT c.id, c.vehicle_id, c.tool_id, c.label, c.interval_months, c.due_date, c.last_done, c.note,
       coalesce(v.name || CASE WHEN v.plate <> '' THEN ' (' || v.plate || ')' ELSE '' END, t.name) AS asset_name
     FROM asset_checks c LEFT JOIN org_vehicles v ON v.id=c.vehicle_id LEFT JOIN org_tools t ON t.id=c.tool_id
     WHERE c.org_id=$1 ORDER BY c.due_date NULLS LAST, asset_name, c.label`,
    [ctx.orgId],
  );
  return rows.map((r) => {
    const dueDate = iso(r.due_date);
    return {
      id: String(r.id),
      assetType: r.vehicle_id ? "vehicle" : "tool",
      assetId: String(r.vehicle_id ?? r.tool_id),
      assetName: String(r.asset_name ?? ""),
      label: String(r.label),
      intervalMonths: r.interval_months === null ? null : Number(r.interval_months),
      dueDate,
      lastDone: iso(r.last_done),
      note: String(r.note ?? ""),
      state: checkState(dueDate, today),
    };
  });
}

/** Notification quinze jours avant chaque échéance, une fois par échéance. */
export async function runFleetReminders(db: Database, now = new Date()) {
  const today = parisDate(now);
  const limit = new Date(now.getTime() + CHECK_REMINDER_DAYS * 86400000).toISOString().slice(0, 10);
  const rows = await db.query<{ id: string; org_id: string; label: string; due_date: unknown; asset_name: string }>(
    `SELECT c.id, c.org_id, c.label, c.due_date, coalesce(v.name, t.name) AS asset_name
     FROM asset_checks c LEFT JOIN org_vehicles v ON v.id=c.vehicle_id LEFT JOIN org_tools t ON t.id=c.tool_id JOIN organizations o ON o.id=c.org_id
     WHERE c.due_date IS NOT NULL AND c.due_date <= $2 AND c.due_date >= $1 AND (c.reminded_for IS NULL OR c.reminded_for <> c.due_date)
       AND o.status='active' LIMIT 1000`,
    [today, limit],
  );
  for (const r of rows) {
    const due = iso(r.due_date)!;
    await notifyOrg(db, r.org_id, {
      title: `${r.label} à prévoir`,
      body: `${r.asset_name} : ${r.label.toLowerCase()} avant le ${due.split("-").reverse().join("/")}.`,
      url: "/app/parc",
    });
    await db.query("UPDATE asset_checks SET reminded_for=due_date WHERE id=$1", [r.id]);
  }
  return { sent: rows.length };
}
