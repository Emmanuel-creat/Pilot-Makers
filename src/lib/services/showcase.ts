/**
 * Vitrine publique de l'entreprise : page générée depuis le profil (nom, métier, ville, assurance, coordonnées),
 * galerie de réalisations tirées du journal de chantier et formulaire de demande de devis.
 *
 * Une photo n'est publiée qu'avec l'accord du client, noté par l'entreprise ; elle est publiée sans ses
 * métadonnées (position GPS, appareil, date). Le nom du client et l'adresse du chantier ne sont jamais affichés,
 * seulement la ville si l'entreprise le souhaite.
 */

import { publicTrust } from "./trust-score";
import { publicAway, routeDuringAway } from "./away-mode";
import { notifyOrg } from "./push";
import { cleanHours, DAYS, parseDayHours } from "@/lib/business-listing";
import type { Hours, ListingSource } from "@/lib/business-listing";
import { z } from "zod";
import { referrerForCode } from "./referrals";
import { one } from "@/lib/db";
import type { Queryable } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { stripImageMetadata } from "@/lib/image-metadata";
import { hitRate } from "@/lib/rate-limit";
import { validateEmail } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import type { PublicLabel } from "@/lib/labels";
import { orgPublicLabels } from "./labels";
import { publicReviews } from "./reviews";
import { readVisitSettings } from "@/lib/visits";
import { parisDate } from "./quotes";

export const SHOWCASE_MAX_PHOTOS = 60;

/** Adresses réservées : elles pourraient prêter à confusion avec les pages de l'application. */
const RESERVED = new Set(["admin", "app", "api", "aide", "connexion", "inscription", "statut", "securite", "pilot-makers", "support", "contact"]);

export interface ShowcaseSettings {
  enabled: boolean;
  slug: string;
  intro: string;
  area: string;
  show_phone: boolean;
  show_email: boolean;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export async function getShowcase(ctx: Ctx): Promise<ShowcaseSettings> {
  const r = await one<ShowcaseSettings>(ctx.db, "SELECT enabled, slug, intro, area, show_phone, show_email FROM showcases WHERE org_id=$1", [ctx.orgId]);
  if (r) return r;
  const org = await one<{ trade_name: string; city: string }>(ctx.db, "SELECT trade_name, city FROM organizations WHERE id=$1", [ctx.orgId]);
  const base = slugify([org?.trade_name, org?.city].filter(Boolean).join(" ")) || "mon-entreprise";
  return { enabled: false, slug: base, intro: "", area: "", show_phone: true, show_email: true };
}

const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());
const settingsSchema = z.object({
  enabled: bool,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Adresse : 3 à 40 caractères, lettres sans accent, chiffres et tirets"),
  intro: z.string().trim().max(1500, "Présentation : 1 500 caractères au plus").default(""),
  area: z.string().trim().max(200).default(""),
  show_phone: bool,
  show_email: bool,
});

export async function updateShowcase(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const p = settingsSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const s = p.data;
  if (RESERVED.has(s.slug)) throw badRequest("Cette adresse est réservée : choisissez-en une autre");
  const taken = await one(ctx.db, "SELECT 1 FROM showcases WHERE slug=$1 AND org_id<>$2", [s.slug, ctx.orgId]);
  if (taken) throw conflict("Cette adresse est déjà prise par une autre entreprise");
  if (s.enabled) {
    const org = await one<{ trade_name: string; siret: string }>(ctx.db, "SELECT trade_name, siret FROM organizations WHERE id=$1", [ctx.orgId]);
    if (!org?.trade_name || !org.siret) throw badRequest("Complétez d'abord le nom commercial et le SIRET de l'entreprise");
  }
  await ctx.db.query(
    `INSERT INTO showcases (org_id, enabled, slug, intro, area, show_phone, show_email) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (org_id) DO UPDATE SET enabled=$2, slug=$3, intro=$4, area=$5, show_phone=$6, show_email=$7, updated_at=now()`,
    [ctx.orgId, s.enabled, s.slug, s.intro, s.area, s.show_phone, s.show_email],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "showcase.update", target: s.slug, data: { enabled: s.enabled }, ip: ctx.ip });
  return s;
}

const photoSchema = z.object({
  caption: z.string().trim().max(160, "Légende : 160 caractères au plus").default(""),
  showCity: bool,
  consent: bool,
  consentNote: z.string().trim().max(300).default(""),
});

/** Publie une photo du journal de chantier dans la galerie, avec l'accord du client. */
export async function addShowcasePhoto(ctx: Ctx, journalId: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const p = photoSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  if (!p.data.consent) throw badRequest("Cochez l'accord du client pour publier la photo");
  const j = await one<{ photo: Uint8Array | null; photo_type: string | null }>(ctx.db, "SELECT photo, photo_type FROM job_journal WHERE id=$1 AND org_id=$2", [
    journalId,
    ctx.orgId,
  ]);
  if (!j?.photo) throw notFound("Photo introuvable");
  const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM showcase_photos WHERE org_id=$1", [ctx.orgId]);
  if (Number(count?.n ?? 0) >= SHOWCASE_MAX_PHOTOS) throw badRequest(`La galerie compte déjà ${SHOWCASE_MAX_PHOTOS} photos : retirez-en une d'abord`);
  let image: Uint8Array;
  try {
    image = stripImageMetadata(j.photo, j.photo_type ?? "image/jpeg");
  } catch {
    throw badRequest("Cette photo ne peut pas être publiée : format non reconnu");
  }
  const row = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO showcase_photos (org_id, journal_id, caption, show_city, consent_note, consent_by, image, image_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (journal_id) DO NOTHING RETURNING id`,
    [ctx.orgId, journalId, p.data.caption, p.data.showCity, p.data.consentNote || "Accord du client confirmé", ctx.userId, image, j.photo_type ?? "image/jpeg"],
  );
  if (!row) throw conflict("Cette photo est déjà dans la galerie");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "showcase.photo_add", target: row.id, ip: ctx.ip });
  return row.id;
}

export async function removeShowcasePhoto(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const r = await ctx.db.query("DELETE FROM showcase_photos WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Photo introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "showcase.photo_remove", target: id, ip: ctx.ip });
}

export interface ShowcasePhoto {
  id: string;
  journal_id: string;
  caption: string;
  city: string;
  job_title?: string;
  created_at: Date;
}

export async function listShowcasePhotos(ctx: Ctx): Promise<ShowcasePhoto[]> {
  return ctx.db.query<ShowcasePhoto>(
    `SELECT p.id, p.journal_id, p.caption, j.site_city AS city, j.title AS job_title, p.created_at
     FROM showcase_photos p JOIN job_journal e ON e.id=p.journal_id JOIN jobs j ON j.id=e.job_id
     WHERE p.org_id=$1 ORDER BY p.created_at DESC`,
    [ctx.orgId],
  );
}

/** Identifiants des photos du journal déjà publiées, pour la fiche chantier. */
export async function publishedJournalIds(ctx: Ctx, jobId: string): Promise<Set<string>> {
  const rows = await ctx.db.query<{ journal_id: string }>(
    "SELECT p.journal_id FROM showcase_photos p JOIN job_journal e ON e.id=p.journal_id WHERE e.job_id=$1 AND p.org_id=$2",
    [jobId, ctx.orgId],
  );
  return new Set(rows.map((r) => r.journal_id));
}

export interface PublicShowcase {
  slug: string;
  name: string;
  trade: string;
  city: string;
  postalCode: string;
  intro: string;
  area: string;
  phone: string;
  email: string;
  website: string;
  logo: string | null;
  siret: string;
  decennale: { insurer: string; area: string } | null;
  hours: Hours;
  photos: { id: string; caption: string; city: string }[];
  labels: PublicLabel[];
  reviews: Awaited<ReturnType<typeof publicReviews>>;
  visits: boolean;
  trust: Awaited<ReturnType<typeof publicTrust>>;
  away: Awaited<ReturnType<typeof publicAway>>;
}

export async function publicShowcase(db: Queryable, slug: string): Promise<PublicShowcase | null> {
  const r = await one<Record<string, unknown>>(
    db,
    `SELECT s.org_id, s.slug, s.intro, s.area, s.hours, s.visit_settings, s.show_phone, s.show_email, s.show_trust, o.trade_name, o.trade, o.city, o.postal_code, o.phone, o.email,
            o.website, o.logo_data, o.siret, o.insurance_decennale, o.insurance_name, o.insurance_area
     FROM showcases s JOIN organizations o ON o.id=s.org_id
     WHERE s.slug=$1 AND s.enabled`,
    [slug],
  );
  if (!r) return null;
  const photos = await db.query<{ id: string; caption: string; city: string; show_city: boolean }>(
    `SELECT p.id, p.caption, p.show_city, j.site_city AS city FROM showcase_photos p
     JOIN job_journal e ON e.id=p.journal_id JOIN jobs j ON j.id=e.job_id WHERE p.org_id=$1 ORDER BY p.created_at DESC`,
    [r.org_id],
  );
  return {
    slug: String(r.slug),
    name: String(r.trade_name),
    trade: String(r.trade ?? ""),
    city: String(r.city ?? ""),
    postalCode: String(r.postal_code ?? ""),
    intro: String(r.intro ?? ""),
    area: String(r.area ?? ""),
    phone: r.show_phone ? String(r.phone ?? "") : "",
    email: r.show_email ? String(r.email ?? "") : "",
    website: String(r.website ?? ""),
    logo: (r.logo_data as string | null) || null,
    siret: String(r.siret ?? ""),
    decennale: r.insurance_decennale ? { insurer: String(r.insurance_name ?? ""), area: String(r.insurance_area ?? "") } : null,
    hours: cleanHours(r.hours),
    photos: photos.map((p) => ({ id: p.id, caption: p.caption, city: p.show_city ? p.city : "" })),
    labels: await orgPublicLabels(db, String(r.org_id), parisDate(new Date())),
    reviews: await publicReviews(db, String(r.org_id)),
    visits: readVisitSettings(r.visit_settings).enabled,
    trust: await publicTrust(db, String(r.org_id), !!r.show_trust),
    away: await publicAway(db, String(r.org_id)),
  };
}

export async function publicShowcasePhoto(db: Queryable, slug: string, photoId: string) {
  const r = await one<{ image: Uint8Array; image_type: string }>(
    db,
    `SELECT p.image, p.image_type FROM showcase_photos p JOIN showcases s ON s.org_id=p.org_id
     WHERE s.slug=$1 AND s.enabled AND p.id=$2`,
    [slug, photoId],
  );
  if (!r) throw notFound("Photo introuvable");
  return { bytes: r.image, type: r.image_type };
}

const leadSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom").max(160),
  email: z.string().trim().max(254).default(""),
  phone: z.string().trim().max(30).default(""),
  city: z.string().trim().max(120).default(""),
  description: z.string().trim().min(10, "Décrivez vos travaux en quelques mots").max(4000),
  consent: bool,
  /** Champ invisible : rempli seulement par les robots */
  website: z.string().default(""),
  /** Code de parrainage du client qui a recommandé l'entreprise */
  parrain: z.string().max(40).default(""),
});

/** Demande de devis déposée sur la vitrine : elle arrive dans les demandes de l'entreprise, qui est prévenue par e-mail. */
export async function requestFromShowcase(db: Queryable & { transaction: Ctx["db"]["transaction"] }, slug: string, raw: unknown, meta: { ip: string }) {
  await hitRate(db, "public.lead", meta.ip);
  const p = leadSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const l = p.data;
  if (!l.consent) throw badRequest("Acceptez que l'entreprise vous recontacte au sujet de votre demande");
  const e = validateEmail(l.email);
  if (e) throw badRequest(e);
  if (!l.email && !l.phone) throw badRequest("Indiquez un téléphone ou une adresse e-mail pour être recontacté");
  const s = await one<{ org_id: string; email: string; trade_name: string }>(
    db,
    "SELECT s.org_id, o.email, o.trade_name FROM showcases s JOIN organizations o ON o.id=s.org_id WHERE s.slug=$1 AND s.enabled",
    [slug],
  );
  if (!s) throw notFound("Page introuvable");
  // Un robot remplit le champ caché : la demande est ignorée sans le lui dire.
  if (l.website) return { ok: true };
  const referrer = l.parrain ? await referrerForCode(db, s.org_id, l.parrain) : null;
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO leads (org_id, name, email, phone, city, description, source, next_action, referrer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      s.org_id,
      l.name,
      l.email.toLowerCase(),
      l.phone,
      l.city,
      l.description,
      referrer ? "recommandation" : "site",
      "Recontacter le demandeur",
      referrer?.customerId ?? null,
    ]);
    if (s.email) {
      await sendMail(tx, {
        orgId: s.org_id,
        kind: "notification",
        to: s.email,
        subject: `Nouvelle demande de devis : ${l.name}`,
        body: `${l.name}${l.city ? ` (${l.city})` : ""} a déposé une demande sur votre page vitrine${referrer ? ", recommandé par l'un de vos clients" : ""} :\n\n${l.description}\n\n${[l.phone, l.email].filter(Boolean).join(" ; ")}\n\n${appUrl("/app/demandes")}`,
      });
    }
    await notifyOrg(tx, s.org_id, { title: `Nouvelle demande de devis : ${l.name}`, body: l.description.slice(0, 140), url: "/app/demandes" });
    await routeDuringAway(tx, s.org_id, { name: l.name, email: l.email, phone: l.phone, city: l.city, description: l.description });
  });
  return { ok: true };
}

/** Ligne de vitrine existante, créée non publiée si besoin (adresse libre la plus proche du nom). */
async function ensureShowcaseRow(ctx: Ctx) {
  if (await one(ctx.db, "SELECT 1 FROM showcases WHERE org_id=$1", [ctx.orgId])) return;
  const base = (await getShowcase(ctx)).slug;
  let slug = RESERVED.has(base) ? `${base}-pro` : base;
  if (await one(ctx.db, "SELECT 1 FROM showcases WHERE slug=$1", [slug])) slug = `${slug.slice(0, 33)}-${ctx.orgId.slice(0, 6)}`;
  await ctx.db.query("INSERT INTO showcases (org_id, slug) VALUES ($1,$2) ON CONFLICT (org_id) DO NOTHING", [ctx.orgId, slug]);
}

/** Informations de la fiche d'établissement, telles qu'elles sont à reporter sur les annuaires. */
export async function getListing(ctx: Ctx): Promise<ListingSource> {
  const sc = await getShowcase(ctx);
  const o = await one<Record<string, string>>(
    ctx.db,
    "SELECT trade_name, trade, address_line1, address_line2, postal_code, city, phone, email, website, siret FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const extra = await one<{ hours: unknown; listing_links: unknown; listing_checked_at: Date | null }>(
    ctx.db,
    "SELECT hours, listing_links, listing_checked_at FROM showcases WHERE org_id=$1",
    [ctx.orgId],
  );
  const links = Array.isArray(extra?.listing_links) ? (extra.listing_links as { site: string; url: string }[]) : [];
  return {
    name: o?.trade_name ?? "",
    trade: o?.trade ?? "",
    addressLine1: o?.address_line1 ?? "",
    addressLine2: o?.address_line2 ?? "",
    postalCode: o?.postal_code ?? "",
    city: o?.city ?? "",
    phone: o?.phone ?? "",
    email: o?.email ?? "",
    website: o?.website ?? "",
    siret: o?.siret ?? "",
    intro: sc.intro,
    area: sc.area,
    hours: cleanHours(extra?.hours),
    showcaseUrl: appUrl(`/pro/${sc.slug}`),
    showcaseEnabled: sc.enabled,
    showPhone: sc.show_phone,
    links: links.filter((l) => l && typeof l.url === "string"),
    checkedAt: extra?.listing_checked_at ?? null,
  };
}

export const LISTING_SITES = ["Google", "PagesJaunes", "Facebook", "Annuaire de la fédération", "Autre"] as const;

const linkSchema = z.object({
  site: z.enum(LISTING_SITES),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(u), "Adresse de fiche : elle doit commencer par https://"),
});

/** Enregistre les horaires (texte libre par jour) et les adresses des fiches tenues ailleurs. */
export async function updateListing(ctx: Ctx, raw: { hours: Partial<Record<string, string>>; links: { site: string; url: string }[] }) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const hours: Hours = {};
  for (const d of DAYS) {
    const ranges = parseDayHours(raw.hours[d.key] ?? "");
    if (ranges === null) throw badRequest(`Horaires du ${d.label.toLowerCase()} non compris : écrivez par exemple 8h-12h, 14h-18h, ou fermé`);
    if (ranges.length > 4) throw badRequest(`${d.label} : quatre plages au plus`);
    if (ranges.length) hours[d.key] = ranges;
  }
  const links: { site: string; url: string }[] = [];
  for (const l of raw.links.filter((x) => x.url.trim()).slice(0, 10)) {
    const p = linkSchema.safeParse(l);
    if (!p.success) throw badRequest(p.error.issues[0].message);
    links.push(p.data);
  }
  await ensureShowcaseRow(ctx);
  await ctx.db.query("UPDATE showcases SET hours=$2, listing_links=$3, updated_at=now() WHERE org_id=$1", [
    ctx.orgId,
    JSON.stringify(hours),
    JSON.stringify(links),
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "showcase.listing", target: ctx.orgId, data: { links: links.length }, ip: ctx.ip });
  return { hours, links };
}

/** Note que les fiches en ligne ont été relues et concordent avec le profil. */
export async function markListingChecked(ctx: Ctx) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  await ensureShowcaseRow(ctx);
  await ctx.db.query("UPDATE showcases SET listing_checked_at=now() WHERE org_id=$1", [ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "showcase.listing_checked", target: ctx.orgId, ip: ctx.ip });
}
