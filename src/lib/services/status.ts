/**
 * Page de statut publique : état des briques du service, mesuré à l'affichage, et incidents publiés
 * par l'administration (perturbation, panne, maintenance prévue). Aucune donnée de client n'y figure.
 */

import { z } from "zod";
import type { Database } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { requirePlatformAdmin } from "./admin";
import type { Ctx } from "./context";
import { audit } from "./context";

export type Level = "ok" | "maintenance" | "perturbation" | "panne";
export const LEVELS: Record<Level, string> = {
  ok: "Opérationnel",
  maintenance: "Maintenance",
  perturbation: "Perturbé",
  panne: "Indisponible",
};
const RANK: Record<Level, number> = { ok: 0, maintenance: 1, perturbation: 2, panne: 3 };
const worst = (a: Level, b: Level) => (RANK[b] > RANK[a] ? b : a);

export interface Incident {
  id: string;
  title: string;
  body: string;
  severity: Exclude<Level, "ok">;
  started_at: Date;
  resolved_at: Date | null;
}

export async function serviceStatus(getDb: () => Promise<Database>, now = new Date()) {
  const components: { name: string; level: Level; detail: string }[] = [];
  let db: Database | null = null;
  const t0 = performance.now();
  try {
    db = await getDb();
    await db.query("SELECT 1");
    const ms = Math.round(performance.now() - t0);
    components.push({
      name: "Application, devis et factures",
      level: ms > 2000 ? "perturbation" : "ok",
      detail: ms > 2000 ? "Temps de réponse élevé" : "",
    });
  } catch {
    components.push({ name: "Application, devis et factures", level: "panne", detail: "Base de données injoignable" });
  }
  let incidents: Incident[] = [];
  if (db) {
    const mails = await one<{ failed: unknown; total: unknown }>(
      db,
      "SELECT count(*) FILTER (WHERE status='failed') AS failed, count(*) AS total FROM emails WHERE created_at > $1",
      [new Date(now.getTime() - 3_600_000)],
    );
    const failed = num(mails?.failed);
    const total = num(mails?.total);
    // Quelques échecs isolés (adresse erronée) sont normaux ; une part importante signale un problème d'envoi.
    const mailLevel: Level = total >= 5 && failed / total > 0.5 ? "panne" : failed >= 5 && failed / total > 0.2 ? "perturbation" : "ok";
    components.push({ name: "Envoi des e-mails", level: mailLevel, detail: mailLevel === "ok" ? "" : "Une partie des e-mails ne part pas" });
    const errors = await one<{ n: unknown }>(db, "SELECT count(*) AS n FROM error_events WHERE created_at > $1", [new Date(now.getTime() - 900_000)]);
    const errLevel: Level = num(errors?.n) >= 50 ? "perturbation" : "ok";
    components.push({
      name: "Pages publiques de devis et espace client",
      level: errLevel,
      detail: errLevel === "ok" ? "" : "Erreurs plus fréquentes que d'habitude",
    });
    incidents = await db.query<Incident>(
      "SELECT id, title, body, severity, started_at, resolved_at FROM status_incidents WHERE resolved_at IS NULL OR resolved_at > $1 ORDER BY started_at DESC LIMIT 30",
      [new Date(now.getTime() - 30 * 86_400_000)],
    );
  }
  let overall: Level = components.reduce<Level>((l, c) => worst(l, c.level), "ok");
  for (const i of incidents) if (!i.resolved_at && i.started_at <= now) overall = worst(overall, i.severity);
  return {
    overall,
    label: LEVELS[overall],
    checkedAt: now.toISOString(),
    components,
    active: incidents.filter((i) => !i.resolved_at),
    resolved: incidents.filter((i) => i.resolved_at),
  };
}

const incidentSchema = z.object({
  title: z.string().trim().min(3, "Titre requis").max(160),
  body: z.string().trim().max(4000).default(""),
  severity: z.enum(["maintenance", "perturbation", "panne"]),
  startsAt: z.string().trim().max(30).default(""),
});

export async function createIncident(ctx: Ctx, raw: unknown) {
  requirePlatformAdmin(ctx);
  const p = incidentSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const start = p.data.startsAt ? new Date(p.data.startsAt) : new Date();
  if (Number.isNaN(start.getTime())) throw badRequest("Date de début invalide");
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO status_incidents (title, body, severity, started_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [p.data.title, p.data.body, p.data.severity, start, ctx.userId],
  );
  await audit(ctx.db, {
    userId: ctx.userId,
    action: "admin.incident_open",
    target: r!.id,
    data: { title: p.data.title, severity: p.data.severity },
    ip: ctx.ip,
  });
  return r!.id;
}

/** Nouvelle information sur un incident en cours (le texte est complété, pas remplacé), ou clôture. */
export async function updateIncident(ctx: Ctx, id: string, raw: { note?: string; resolve?: boolean }, now = new Date()) {
  requirePlatformAdmin(ctx);
  const cur = await one<{ body: string; resolved_at: Date | null }>(ctx.db, "SELECT body, resolved_at FROM status_incidents WHERE id=$1", [id]);
  if (!cur) throw notFound("Incident introuvable");
  if (cur.resolved_at) throw badRequest("Incident déjà clos");
  const note = String(raw.note ?? "")
    .trim()
    .slice(0, 2000);
  const stamp = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  const body = note ? [cur.body, `${stamp} : ${note}`].filter(Boolean).join("\n") : cur.body;
  await ctx.db.query("UPDATE status_incidents SET body=$2, resolved_at=$3, updated_at=now() WHERE id=$1", [id, body, raw.resolve ? now : null]);
  await audit(ctx.db, { userId: ctx.userId, action: raw.resolve ? "admin.incident_resolve" : "admin.incident_update", target: id, ip: ctx.ip });
}

export async function listIncidents(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  return ctx.db.query<Incident>("SELECT id, title, body, severity, started_at, resolved_at FROM status_incidents ORDER BY started_at DESC LIMIT 100");
}
