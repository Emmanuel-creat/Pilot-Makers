/** Entretiens préventifs des équipements notés dans les carnets de logement, et e-mails aux clients avant l'échéance. */

import { z } from "zod";
import { one, type Database, type Queryable } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { maintenanceState, nextDue, noticeMail, NOTICE_DAYS, type MaintenanceState } from "@/lib/maintenance";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { sendMail } from "./mail";
import { parisDate } from "./quotes";

const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";
const iso = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

export interface MaintenanceItem {
  id: string;
  recordId: string;
  orgId: string;
  label: string;
  brand: string;
  installed: string;
  months: number;
  lastService: string | null;
  due: string;
  state: MaintenanceState;
  customer: string;
  customerEmail: string;
  optedOut: boolean;
  address: string;
  notified: boolean;
}

async function equipments(db: Queryable, where: string, params: unknown[], today: string): Promise<MaintenanceItem[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT e.id, e.record_id, e.org_id, e.label, e.brand, e.entry_date, e.maintenance_months,
       (SELECT max(s.entry_date) FROM home_record_entries s WHERE s.equipment_id=e.id) AS last_service,
       ${CUSTOMER} AS customer, c.email AS customer_email, c.marketing_optout_at IS NOT NULL AS opted_out,
       h.line1 || ', ' || h.postal_code || ' ' || h.city AS address,
       (SELECT array_agg(n.due_date::text) FROM maintenance_notices n WHERE n.entry_id=e.id) AS notices
     FROM home_record_entries e JOIN home_records h ON h.id=e.record_id JOIN customers c ON c.id=h.customer_id
     WHERE e.kind='equipement' AND e.maintenance_months IS NOT NULL AND ${where}`,
    params,
  );
  return rows
    .map((r) => {
      const installed = iso(r.entry_date)!;
      const months = Number(r.maintenance_months);
      const lastService = iso(r.last_service);
      const due = nextDue(installed, months, lastService);
      const notices = Array.isArray(r.notices) ? (r.notices as string[]).map((d) => d.slice(0, 10)) : [];
      return {
        id: String(r.id),
        recordId: String(r.record_id),
        orgId: String(r.org_id),
        label: String(r.label),
        brand: String(r.brand),
        installed,
        months,
        lastService,
        due,
        state: maintenanceState(due, today),
        customer: String(r.customer),
        customerEmail: String(r.customer_email ?? ""),
        optedOut: Boolean(r.opted_out),
        address: String(r.address),
        notified: notices.includes(due),
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export async function maintenanceBoard(ctx: Ctx, now = new Date()) {
  return equipments(ctx.db, "e.org_id=$1", [ctx.orgId], parisDate(now));
}

/** Nombre d'entretiens en retard ou à proposer, pour les conseils du tableau de bord. */
export async function maintenanceDueCount(ctx: Ctx, now = new Date()) {
  return (await maintenanceBoard(ctx, now)).filter((m) => m.state !== "a_jour").length;
}

const serviceSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"), detail: z.string().trim().max(2000).default("") });

export async function recordMaintenance(ctx: Ctx, equipmentId: string, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  const p = serviceSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  if (p.data.date > parisDate(now)) throw badRequest("L'entretien ne peut pas être daté dans le futur");
  if (!isUuid(equipmentId)) throw notFound("Équipement introuvable");
  const eq = await one<{ record_id: string; label: string }>(
    ctx.db,
    "SELECT record_id, label FROM home_record_entries WHERE id=$1 AND org_id=$2 AND kind='equipement'",
    [equipmentId, ctx.orgId],
  );
  if (!eq) throw notFound("Équipement introuvable");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO home_record_entries (org_id, record_id, entry_date, kind, label, detail, equipment_id, created_by)
     VALUES ($1,$2,$3,'entretien',$4,$5,$6,$7) RETURNING id`,
    [ctx.orgId, eq.record_id, p.data.date, `Entretien : ${eq.label}`, p.data.detail, equipmentId, ctx.userId],
  );
  return { id: r!.id, recordId: eq.record_id };
}

/** Tâche planifiée : un e-mail par échéance, au client qui a une adresse et n'a pas refusé les messages commerciaux. */
export async function runMaintenanceNotices(db: Database, now = new Date()) {
  const today = parisDate(now);
  const items = await equipments(db, "EXISTS (SELECT 1 FROM organizations o WHERE o.id=e.org_id AND o.status='active')", [], today);
  let sent = 0;
  for (const m of items) {
    if (m.state !== "bientot" || m.notified || m.optedOut || !m.customerEmail) continue;
    const org = await one<{ name: string; phone: string }>(
      db,
      "SELECT coalesce(nullif(trade_name, ''), legal_name) AS name, phone FROM organizations WHERE id=$1",
      [m.orgId],
    );
    const mail = noticeMail({ equipment: m.label, brand: m.brand, address: m.address, due: m.due, orgName: org?.name ?? "", orgPhone: org?.phone ?? "" });
    const claimed = await one(db, "INSERT INTO maintenance_notices (entry_id, due_date) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING entry_id", [
      m.id,
      m.due,
    ]);
    if (!claimed) continue;
    const e = await sendMail(db, { orgId: m.orgId, kind: "maintenance", to: m.customerEmail, ...mail, idempotencyKey: `maintenance:${m.id}:${m.due}` });
    await db.query("UPDATE maintenance_notices SET email_id=$3 WHERE entry_id=$1 AND due_date=$2", [m.id, m.due, e.id]);
    sent++;
  }
  return { sent, window: NOTICE_DAYS };
}
