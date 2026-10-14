/** Mise en relation : profil de réception de l'artisan et demandes déposées par les particuliers. */

import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { MATCH_TRADES, TIMEFRAMES, departmentOf, matchRequestSchema, matchingProfileSchema, parseDepartments, pickArtisans } from "@/lib/matching";
import { hitRate } from "@/lib/rate-limit";
import { validateEmail } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { notifyOrg } from "./push";

export interface MatchingProfile {
  enabled: boolean;
  trades: string[];
  departments: string[];
  weeklyCap: number;
  lastWeek: number;
  received: number;
}

export async function getMatchingProfile(ctx: Ctx): Promise<MatchingProfile> {
  const [p, stats] = await Promise.all([
    one<{ enabled: boolean; trades: string[]; departments: string[]; weekly_cap: unknown }>(
      ctx.db,
      "SELECT enabled, trades, departments, weekly_cap FROM matching_profiles WHERE org_id=$1",
      [ctx.orgId],
    ),
    one<{ week: unknown; total: unknown }>(
      ctx.db,
      "SELECT count(*) FILTER (WHERE created_at > now() - interval '7 days') AS week, count(*) AS total FROM match_assignments WHERE org_id=$1",
      [ctx.orgId],
    ),
  ]);
  return {
    enabled: p?.enabled ?? false,
    trades: p?.trades ?? [],
    departments: p?.departments ?? [],
    weeklyCap: p ? num(p.weekly_cap) : 5,
    lastWeek: num(stats?.week),
    received: num(stats?.total),
  };
}

/** Réglages de réception ; l'activation exige une entreprise identifiée et assurée. */
export async function saveMatchingProfile(ctx: Ctx, raw: unknown) {
  requireRole(ctx, "admin");
  requireWritable(ctx);
  const parsed = matchingProfileSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const p = parsed.data;
  const { departments, invalid } = parseDepartments(p.departments);
  if (invalid.length) throw badRequest(`Département inconnu : ${invalid.join(", ")}`);
  if (p.enabled) {
    if (!p.trades.length) throw badRequest("Choisissez au moins un type de travaux");
    if (!departments.length) throw badRequest("Indiquez au moins un département d'intervention");
    const org = await one<{ siren: string; insurance_name: string }>(ctx.db, "SELECT siren, insurance_name FROM organizations WHERE id=$1", [ctx.orgId]);
    if (!org?.siren.trim() || !org.insurance_name.trim()) {
      throw badRequest(
        "Renseignez le SIREN et l'assurance professionnelle dans le profil de l'entreprise : les particuliers ne sont mis en relation qu'avec des entreprises identifiées et assurées",
      );
    }
  }
  await ctx.db.query(
    `INSERT INTO matching_profiles (org_id, enabled, trades, departments, weekly_cap, updated_at) VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (org_id) DO UPDATE SET enabled=EXCLUDED.enabled, trades=EXCLUDED.trades, departments=EXCLUDED.departments,
       weekly_cap=EXCLUDED.weekly_cap, updated_at=now()`,
    [ctx.orgId, p.enabled, p.trades, departments, p.weeklyCap],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "matching.profile", data: { enabled: p.enabled } });
}

export interface MatchedArtisan {
  name: string;
  city: string;
  showcase: string | null;
}

/**
 * Demande d'un particulier : transmise à trois artisans au plus, qui la reçoivent dans leurs
 * demandes. Sans artisan disponible, rien n'est conservé des coordonnées du demandeur.
 */
export async function requestMatch(db: Database, raw: unknown, meta: { ip: string }, now = new Date()): Promise<{ artisans: MatchedArtisan[] }> {
  await hitRate(db, "public.lead", meta.ip);
  const parsed = matchRequestSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const r = parsed.data;
  const e = validateEmail(r.email);
  if (e) throw badRequest(e);
  if (!r.email && !r.phone) throw badRequest("Indiquez un téléphone ou une adresse e-mail pour être recontacté");
  if (r.website) return { artisans: [] };
  const dep = departmentOf(r.postalCode)!;
  const candidates = await db.query<{ org_id: string; weekly_cap: unknown; last_week: unknown; last_at: Date | null }>(
    `SELECT p.org_id, p.weekly_cap,
            (SELECT count(*) FROM match_assignments a WHERE a.org_id=p.org_id AND a.created_at > $3::timestamptz - interval '7 days') AS last_week,
            (SELECT max(a.created_at) FROM match_assignments a WHERE a.org_id=p.org_id) AS last_at
       FROM matching_profiles p JOIN organizations o ON o.id=p.org_id
      WHERE p.enabled AND $1 = ANY(p.trades) AND $2 = ANY(p.departments) AND o.status = 'active'`,
    [r.trade, dep, now],
  );
  const chosen = pickArtisans(candidates.map((c) => ({ orgId: c.org_id, weeklyCap: num(c.weekly_cap), lastWeek: num(c.last_week), lastAt: c.last_at })));
  const tradeLabel = MATCH_TRADES.find((t) => t.key === r.trade)!.label;
  const description = `${tradeLabel}, ${TIMEFRAMES[r.timeframe].toLowerCase()}. ${r.description}`;
  const where = [r.postalCode, r.city].filter(Boolean).join(" ");
  const artisans: MatchedArtisan[] = [];
  await db.transaction(async (tx) => {
    const req = await one<{ id: string }>(
      tx,
      "INSERT INTO match_requests (trade, department, timeframe, matched, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [r.trade, dep, r.timeframe, chosen.length, now],
    );
    for (const orgId of chosen) {
      const lead = await one<{ id: string }>(
        tx,
        `INSERT INTO leads (org_id, name, email, phone, city, description, source, next_action) VALUES ($1,$2,$3,$4,$5,$6,'plateforme',$7) RETURNING id`,
        [orgId, r.name, r.email.toLowerCase(), r.phone, where, description, "Recontacter le particulier sous 48 heures"],
      );
      await tx.query("INSERT INTO match_assignments (request_id, org_id, lead_id, created_at) VALUES ($1,$2,$3,$4)", [req!.id, orgId, lead!.id, now]);
      const org = await one<{ name: string; city: string; email: string; slug: string | null }>(
        tx,
        `SELECT coalesce(nullif(o.trade_name,''), o.legal_name) AS name, o.city, o.email, s.slug
           FROM organizations o LEFT JOIN showcases s ON s.org_id=o.id AND s.enabled WHERE o.id=$1`,
        [orgId],
      );
      artisans.push({ name: org!.name, city: org!.city, showcase: org!.slug ? `/pro/${org!.slug}` : null });
      const subject = `Demande d'un particulier : ${tradeLabel.toLowerCase()} à ${where}`;
      if (org!.email) {
        await sendMail(tx, {
          orgId,
          kind: "notification",
          to: org!.email,
          subject,
          body: `${r.name} cherche un artisan (${TIMEFRAMES[r.timeframe].toLowerCase()}) :\n\n${r.description}\n\n${[r.phone, r.email].filter(Boolean).join(" ; ")}\n\nLa demande a été transmise à ${chosen.length} entreprise${chosen.length > 1 ? "s" : ""} au plus. ${appUrl("/app/demandes")}`,
        });
      }
      await notifyOrg(tx, orgId, { title: subject, body: r.description.slice(0, 140), url: "/app/demandes" });
    }
  });
  return { artisans };
}

/** Statistiques publiques de la mise en relation (aucune donnée personnelle). */
export async function matchingStats(q: Queryable) {
  const r = await one<{ artisans: unknown; requests: unknown }>(
    q,
    "SELECT (SELECT count(*) FROM matching_profiles WHERE enabled) AS artisans, (SELECT count(*) FROM match_requests WHERE matched > 0) AS requests",
  );
  return { artisans: num(r?.artisans), requests: num(r?.requests) };
}
