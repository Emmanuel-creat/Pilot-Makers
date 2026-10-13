/**
 * Notes de frais : chaque personne photographie son ticket et saisit le montant ; l'encadrement
 * valide ou refuse, puis marque comme remboursé ce qui a été avancé personnellement. Une dépense
 * validée et rattachée à un chantier s'ajoute à ses achats (montant HT).
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, can, requirePermission, requireWritable } from "./context";
import { imageType } from "./job-site";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";
import { tableCsv } from "./export";

export const EXPENSE_CATEGORIES = {
  repas: "Repas",
  carburant: "Carburant",
  peage_parking: "Péage et stationnement",
  fournitures: "Petites fournitures",
  hebergement: "Hébergement",
  transport: "Transport",
  autre: "Autre",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export const PAYMENTS = { perso: "Avancé personnellement", entreprise: "Carte de l'entreprise" } as const;
export type Payment = keyof typeof PAYMENTS;

export const EXPENSE_STATUSES = { soumis: "À valider", valide: "Validée", refuse: "Refusée", rembourse: "Remboursée" } as const;
export type ExpenseStatus = keyof typeof EXPENSE_STATUSES;

export const RECEIPT_MAX_BYTES = 4_000_000;

export interface Expense {
  id: string;
  user_id: string;
  user_name: string;
  job_id: string | null;
  job_title: string | null;
  expense_date: string;
  merchant: string;
  category: ExpenseCategory;
  amount_ttc_cents: number;
  vat_cents: number;
  payment: Payment;
  note: string;
  has_photo: boolean;
  status: ExpenseStatus;
  review_note: string;
}

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  merchant: z.string().trim().max(120).default(""),
  category: z.enum(Object.keys(EXPENSE_CATEGORIES) as [ExpenseCategory, ...ExpenseCategory[]], { message: "Catégorie inconnue" }),
  amount: z.string().trim().min(1, "Indiquez le montant TTC"),
  vat: z.string().trim().default(""),
  payment: z.enum(["perso", "entreprise"]).default("perso"),
  jobId: z.string().default(""),
  note: z.string().trim().max(500).default(""),
});

function cents(input: string, label: string) {
  try {
    return eurosToCents(input.replace(/[\s€]/g, ""), label);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
}

/** Nouvelle note de frais de la personne connectée, avec la photo du ticket. */
export async function addExpense(ctx: Ctx, raw: unknown, photo: Uint8Array | null = null, now = new Date()) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  const today = parisDate(now);
  if (d.date > today) throw badRequest("La date ne peut pas être dans le futur");
  if (d.date < parisDate(new Date(now.getTime() - 366 * 86_400_000))) throw badRequest("Dépense de plus d'un an : non acceptée");
  const ttc = cents(d.amount, "Montant TTC");
  if (ttc <= 0 || ttc > 10_000_00) throw badRequest("Montant TTC entre 0,01 et 10 000 euros");
  const vat = d.vat ? cents(d.vat, "TVA") : 0;
  if (vat < 0 || vat >= ttc) throw badRequest("La TVA doit être inférieure au montant TTC");
  let jobId: string | null = null;
  if (d.jobId) {
    if (!isUuid(d.jobId) || !(await one(ctx.db, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [d.jobId, ctx.orgId])))
      throw badRequest("Chantier introuvable");
    jobId = d.jobId;
  }
  let type: string | null = null;
  if (photo && photo.length) {
    if (photo.length > RECEIPT_MAX_BYTES) throw badRequest("Photo trop lourde (4 Mo au plus)");
    type = imageType(photo) ?? (photo[0] === 0x25 && photo[1] === 0x50 && photo[2] === 0x44 && photo[3] === 0x46 ? "application/pdf" : null);
    if (!type) throw badRequest("Format non reconnu : photo JPEG, PNG, WebP ou PDF");
  } else photo = null;
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO expenses (org_id, user_id, job_id, expense_date, merchant, category, amount_ttc_cents, vat_cents, payment, note, photo, photo_type, photo_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [ctx.orgId, ctx.userId, jobId, d.date, d.merchant, d.category, ttc, vat, d.payment, d.note, photo, type, photo ? sha256(photo) : null],
  );
  return r!.id;
}

const SELECT = `SELECT e.id, e.user_id, u.name AS user_name, e.job_id, j.title AS job_title, e.expense_date, e.merchant, e.category,
  e.amount_ttc_cents, e.vat_cents, e.payment, e.note, e.photo IS NOT NULL AS has_photo, e.status, e.review_note
  FROM expenses e JOIN users u ON u.id=e.user_id LEFT JOIN jobs j ON j.id=e.job_id`;

function mapExpense(r: Record<string, unknown>): Expense {
  return {
    ...(r as unknown as Expense),
    expense_date: r.expense_date instanceof Date ? r.expense_date.toISOString().slice(0, 10) : String(r.expense_date).slice(0, 10),
    amount_ttc_cents: num(r.amount_ttc_cents),
    vat_cents: num(r.vat_cents),
    has_photo: !!r.has_photo,
  };
}

const monthBounds = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("Mois invalide");
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: end };
};

/** Notes du mois : les siennes pour un membre, toute l'équipe pour l'encadrement. */
export async function listExpenses(ctx: Ctx, opts: { month: string; team?: boolean }) {
  const { from, to } = monthBounds(opts.month);
  const team = !!opts.team && can(ctx, "staff");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `${SELECT} WHERE e.org_id=$1 AND e.expense_date BETWEEN $2 AND $3 ${team ? "" : "AND e.user_id=$4"} ORDER BY e.expense_date DESC, e.created_at DESC`,
    team ? [ctx.orgId, from, to] : [ctx.orgId, from, to, ctx.userId],
  );
  return rows.map(mapExpense);
}

/** Notes en attente de validation, tous mois confondus (encadrement). */
export async function pendingExpenses(ctx: Ctx) {
  if (!can(ctx, "staff")) return [];
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE e.org_id=$1 AND e.status='soumis' ORDER BY e.expense_date LIMIT 300`, [
    ctx.orgId,
  ]);
  return rows.map(mapExpense);
}

async function load(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Note de frais introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, `${SELECT} WHERE e.id=$1 AND e.org_id=$2`, [id, ctx.orgId]);
  if (!r) throw notFound("Note de frais introuvable");
  const e = mapExpense(r);
  if (!can(ctx, "staff") && e.user_id !== ctx.userId) throw notFound("Note de frais introuvable");
  return e;
}

/** Suppression : par son auteur tant qu'elle n'est pas validée, ou par l'encadrement. */
export async function deleteExpense(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const e = await load(ctx, id);
  if (!can(ctx, "staff") && (e.status === "valide" || e.status === "rembourse")) throw conflict("Note déjà validée : demandez à l'encadrement");
  if (e.status === "rembourse") throw conflict("Note déjà remboursée : elle se conserve");
  await ctx.db.query("DELETE FROM expenses WHERE id=$1", [id]);
}

export async function expensePhoto(ctx: Ctx, id: string) {
  const e = await load(ctx, id);
  const r = await one<{ photo: Uint8Array | null; photo_type: string | null }>(ctx.db, "SELECT photo, photo_type FROM expenses WHERE id=$1", [e.id]);
  if (!r?.photo) throw notFound("Pas de justificatif");
  return { bytes: r.photo, type: r.photo_type ?? "image/jpeg" };
}

/** Validation par l'encadrement : valider, refuser avec une raison, rouvrir ou marquer remboursé. */
export async function reviewExpenses(ctx: Ctx, ids: string[], decision: "valide" | "refuse" | "soumis" | "rembourse", note = "") {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  const valid = ids.filter(isUuid);
  if (!valid.length) throw badRequest("Sélectionnez au moins une note de frais");
  if (!["valide", "refuse", "soumis", "rembourse"].includes(decision)) throw badRequest("Décision inconnue");
  if (decision === "refuse" && !note.trim()) throw badRequest("Indiquez la raison du refus");
  return ctx.db.transaction(async (tx) => {
    const rows = await tx.query<Record<string, unknown>>(`${SELECT} WHERE e.org_id=$1 AND e.id = ANY($2::uuid[]) FOR UPDATE OF e`, [
      ctx.orgId,
      valid,
    ]);
    let updated = 0;
    for (const e of rows.map(mapExpense)) {
      if (decision === "rembourse") {
        // Seul ce qui a été avancé et validé se rembourse.
        if (e.status !== "valide" || e.payment !== "perso") continue;
        await tx.query("UPDATE expenses SET status='rembourse', reimbursed_at=now() WHERE id=$1", [e.id]);
        updated++;
        continue;
      }
      if (e.status === "rembourse") continue;
      await tx.query("UPDATE expenses SET status=$2, review_note=$3, reviewed_by=$4, reviewed_at=$5 WHERE id=$1", [
        e.id,
        decision,
        decision === "refuse" ? note.trim().slice(0, 300) : "",
        decision === "soumis" ? null : ctx.userId,
        decision === "soumis" ? null : new Date(),
      ]);
      await tx.query("DELETE FROM job_purchases WHERE expense_id=$1", [e.id]);
      if (decision === "valide" && e.job_id) {
        await tx.query(
          `INSERT INTO job_purchases (org_id, job_id, expense_id, purchase_date, supplier, label, category, amount_ht_cents, reference, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'',$9)`,
          [
            ctx.orgId,
            e.job_id,
            e.id,
            e.expense_date,
            e.merchant,
            `Note de frais ${e.user_name} : ${EXPENSE_CATEGORIES[e.category].toLowerCase()}`,
            e.category === "fournitures" ? "materiau" : "autre",
            e.amount_ttc_cents - e.vat_cents,
            ctx.userId,
          ],
        );
      }
      updated++;
    }
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: `expense.${decision}`, data: { count: updated }, ip: ctx.ip });
    return { updated };
  });
}

/** Totaux du mois par personne : dépensé, validé, reste à rembourser. */
export function expenseTotals(list: Expense[]) {
  const by = new Map<string, { name: string; totalCents: number; validatedCents: number; toReimburseCents: number; reimbursedCents: number }>();
  for (const e of list) {
    const t = by.get(e.user_id) ?? { name: e.user_name, totalCents: 0, validatedCents: 0, toReimburseCents: 0, reimbursedCents: 0 };
    if (e.status !== "refuse") t.totalCents += e.amount_ttc_cents;
    if (e.status === "valide" || e.status === "rembourse") t.validatedCents += e.amount_ttc_cents;
    if (e.status === "valide" && e.payment === "perso") t.toReimburseCents += e.amount_ttc_cents;
    if (e.status === "rembourse") t.reimbursedCents += e.amount_ttc_cents;
    by.set(e.user_id, t);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Export du mois pour la comptabilité (encadrement). */
export async function expensesCsv(ctx: Ctx, month: string) {
  requirePermission(ctx, "staff");
  const list = await listExpenses(ctx, { month, team: true });
  const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  return tableCsv(
    list
      .slice()
      .reverse()
      .map((e) => ({
        date: e.expense_date,
        personne: e.user_name,
        chantier: e.job_title ?? "",
        categorie: EXPENSE_CATEGORIES[e.category],
        fournisseur: e.merchant,
        montant_ttc: eur(e.amount_ttc_cents),
        tva: eur(e.vat_cents),
        montant_ht: eur(e.amount_ttc_cents - e.vat_cents),
        paiement: PAYMENTS[e.payment],
        statut: EXPENSE_STATUSES[e.status],
        justificatif: e.has_photo ? "oui" : "non",
        note: e.note,
      })),
  );
}
