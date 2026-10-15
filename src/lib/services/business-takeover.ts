/** Reprise d'entreprises artisanales : annonce anonyme du cédant, consultation publique, prise de contact du repreneur. */

import type { Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import {
  contactSchema,
  identifyingFragments,
  type Identity,
  listingRef,
  listingSchema,
  type ListingStatus,
  revenueBand,
  staffBand,
} from "@/lib/business-takeover";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { departmentOf } from "@/lib/matching";
import { hitRate } from "@/lib/rate-limit";
import { validateEmail } from "@/lib/validation/identifiers";
import { transferInputs } from "./business-transfer";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { notifyOrg } from "./push";

export interface TransferListing {
  id: string;
  status: ListingStatus;
  headline: string;
  description: string;
  reason: string;
  accompanimentMonths: number;
  trade: string;
  department: string;
  revenueBand: string;
  staffBand: string;
  publishedAt: string | null;
}

const COLS = `id, status, headline, description, reason, accompaniment_months, trade, department, revenue_band, staff_band, published_at`;
const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const toListing = (r: Record<string, unknown>): TransferListing => ({
  id: String(r.id),
  status: r.status as ListingStatus,
  headline: String(r.headline),
  description: String(r.description),
  reason: String(r.reason),
  accompanimentMonths: Number(r.accompaniment_months),
  trade: String(r.trade),
  department: String(r.department),
  revenueBand: String(r.revenue_band),
  staffBand: String(r.staff_band),
  publishedAt: iso(r.published_at),
});

/** Ce que l'application sait de l'entreprise : métier, département, tranches, et ce qui l'identifierait. */
async function facts(ctx: Ctx) {
  const o = await one<Record<string, string>>(
    ctx.db,
    "SELECT trade_name, legal_name, trade, postal_code, address_line1, siret, phone, email FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const inputs = await transferInputs(ctx);
  const identity: Identity = {
    names: [o?.trade_name ?? "", o?.legal_name ?? ""].filter(Boolean),
    siret: o?.siret ?? "",
    phone: o?.phone ?? "",
    email: o?.email ?? "",
    street: o?.address_line1 ?? "",
  };
  return {
    trade: o?.trade ?? "",
    department: departmentOf(o?.postal_code ?? "") ?? "",
    revenueBand: revenueBand(inputs.years.map((y) => y.revenueCents)),
    staffBand: staffBand(inputs.teamMembers),
    identity,
  };
}

/** Annonce de l'entreprise, tranches calculées et prises de contact reçues. */
export async function myTransferListing(ctx: Ctx) {
  requirePermission(ctx, "billing");
  const f = await facts(ctx);
  const r = await one<Record<string, unknown>>(ctx.db, `SELECT ${COLS} FROM transfer_listings WHERE org_id=$1`, [ctx.orgId]);
  const listing = r ? toListing(r) : null;
  const contacts = listing
    ? (
        await ctx.db.query<{ id: string; name: string; email: string; phone: string; message: string; created_at: unknown }>(
          "SELECT id, name, email, phone, message, created_at FROM transfer_contacts WHERE listing_id=$1 ORDER BY created_at DESC LIMIT 100",
          [listing.id],
        )
      ).map((c) => ({ ...c, createdAt: iso(c.created_at)! }))
    : [];
  return { listing, contacts, computed: { trade: f.trade, department: f.department, revenueBand: f.revenueBand, staffBand: f.staffBand } };
}

function guard(text: string, identity: Identity) {
  const found = identifyingFragments(text, identity);
  if (found.length) throw badRequest(`L'annonce doit rester anonyme : retirez ${found.join(", ")}.`);
}

/** Enregistre l'annonce ; les tranches, le métier et le département sont recalculés à chaque enregistrement. */
export async function saveTransferListing(ctx: Ctx, raw: unknown): Promise<TransferListing> {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  const p = listingSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const f = await facts(ctx);
  guard(`${p.data.headline}\n${p.data.description}`, f.identity);
  const r = await one<Record<string, unknown>>(
    ctx.db,
    `INSERT INTO transfer_listings (org_id, headline, description, reason, accompaniment_months, trade, department, revenue_band, staff_band)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (org_id) DO UPDATE SET headline=EXCLUDED.headline, description=EXCLUDED.description, reason=EXCLUDED.reason,
       accompaniment_months=EXCLUDED.accompaniment_months, trade=EXCLUDED.trade, department=EXCLUDED.department,
       revenue_band=EXCLUDED.revenue_band, staff_band=EXCLUDED.staff_band, updated_at=now()
     RETURNING ${COLS}`,
    [ctx.orgId, p.data.headline, p.data.description, p.data.reason, p.data.accompanimentMonths, f.trade, f.department, f.revenueBand, f.staffBand],
  );
  return toListing(r!);
}

/** Publie ou retire l'annonce. La publication revérifie l'anonymat et demande un métier et un département connus. */
export async function setTransferListingStatus(ctx: Ctx, status: "publiee" | "retiree"): Promise<void> {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  const r = await one<Record<string, unknown>>(ctx.db, `SELECT ${COLS} FROM transfer_listings WHERE org_id=$1`, [ctx.orgId]);
  if (!r) throw notFound("Rédigez d'abord l'annonce");
  const l = toListing(r);
  if (status === "publiee") {
    const f = await facts(ctx);
    guard(`${l.headline}\n${l.description}`, f.identity);
    if (!f.trade || !f.department) throw conflict("Renseignez le métier et le code postal de l'entreprise dans son profil avant de publier");
    await ctx.db.query(
      `UPDATE transfer_listings SET status='publiee', trade=$2, department=$3, revenue_band=$4, staff_band=$5,
         published_at=coalesce(published_at, now()), updated_at=now() WHERE org_id=$1`,
      [ctx.orgId, f.trade, f.department, f.revenueBand, f.staffBand],
    );
  } else {
    await ctx.db.query("UPDATE transfer_listings SET status='retiree', updated_at=now() WHERE org_id=$1", [ctx.orgId]);
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: status === "publiee" ? "transfer.publish" : "transfer.withdraw", target: l.id });
}

export type PublicTransferListing = Omit<TransferListing, "status"> & { ref: string };
const toPublic = ({ status: _s, ...l }: TransferListing): PublicTransferListing => ({ ...l, ref: listingRef(l.id) });

/** Annonces publiées, les plus récentes d'abord, filtrables par département et par métier. */
export async function publicTransferListings(db: Queryable, filters: { department?: string; trade?: string } = {}): Promise<PublicTransferListing[]> {
  const dep = (filters.department ?? "").trim().toUpperCase();
  const trade = (filters.trade ?? "").trim();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${COLS} FROM transfer_listings WHERE status='publiee'
       AND ($1 = '' OR department = $1) AND ($2 = '' OR lower(trade) = lower($2))
     ORDER BY published_at DESC LIMIT 200`,
    [dep, trade],
  );
  return rows.map((r) => toPublic(toListing(r)));
}

/** Métiers représentés parmi les annonces publiées, pour le filtre */
export async function publicTransferTrades(db: Queryable): Promise<string[]> {
  const rows = await db.query<{ trade: string }>("SELECT DISTINCT trade FROM transfer_listings WHERE status='publiee' AND trade <> '' ORDER BY trade");
  return rows.map((r) => r.trade);
}

export async function publicTransferListing(db: Queryable, id: string): Promise<PublicTransferListing | null> {
  if (!isUuid(id)) return null;
  const r = await one<Record<string, unknown>>(db, `SELECT ${COLS} FROM transfer_listings WHERE id=$1 AND status='publiee'`, [id]);
  return r ? toPublic(toListing(r)) : null;
}

/** Prise de contact d'un repreneur : le cédant est prévenu et décide seul de répondre ; son identité reste cachée. */
export async function contactTransferListing(db: Queryable & { transaction: Ctx["db"]["transaction"] }, id: string, raw: unknown, meta: { ip: string }) {
  await hitRate(db, "public.lead", meta.ip);
  const p = contactSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const c = p.data;
  const e = validateEmail(c.email);
  if (e) throw badRequest(e);
  if (!c.email && !c.phone) throw badRequest("Indiquez un téléphone ou une adresse e-mail pour être recontacté");
  const l = isUuid(id)
    ? await one<{ id: string; org_id: string; email: string }>(
        db,
        "SELECT l.id, l.org_id, o.email FROM transfer_listings l JOIN organizations o ON o.id=l.org_id WHERE l.id=$1 AND l.status='publiee'",
        [id],
      )
    : null;
  if (!l) throw notFound("Annonce introuvable ou retirée");
  if (c.website) return { ok: true };
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO transfer_contacts (listing_id, name, email, phone, message) VALUES ($1,$2,$3,$4,$5)", [
      l.id,
      c.name,
      c.email.toLowerCase(),
      c.phone,
      c.message,
    ]);
    const title = `Un repreneur s'intéresse à votre entreprise : ${c.name}`;
    if (l.email) {
      await sendMail(tx, {
        orgId: l.org_id,
        kind: "notification",
        to: l.email,
        subject: title,
        body: `${c.name} a répondu à votre annonce de reprise (${listingRef(l.id)}) :\n\n${c.message}\n\n${[c.phone, c.email].filter(Boolean).join(" ; ")}\n\nVotre identité ne lui a pas été communiquée : vous choisissez de répondre ou non.\n\n${appUrl("/app/rapports/transmission/annonce")}`,
      });
    }
    await notifyOrg(tx, l.org_id, { title, body: c.message.slice(0, 140), url: "/app/rapports/transmission/annonce" });
  });
  return { ok: true };
}
