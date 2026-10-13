/**
 * Limitation de débit, partagée entre toutes les instances : un compteur par
 * fenêtre de temps fixe, en base. Chaque règle compte par compte (entreprise ou
 * utilisateur) ou par adresse IP, selon la clé qu'on lui donne.
 */

import type { Queryable } from "@/lib/db";
import { num } from "@/lib/db";
import { HttpError } from "@/lib/http";

export interface RateRule {
  limit: number;
  windowSec: number;
  message: string;
}

const minutes = (n: number) => (n <= 1 ? "une minute" : n < 60 ? `${n} minutes` : n === 60 ? "une heure" : `${n / 60} heures`);
const rule = (limit: number, windowSec: number, what: string): RateRule => ({
  limit,
  windowSec,
  message: `${what} Réessayez dans ${minutes(Math.ceil(windowSec / 60))}.`,
});

export const RATE_RULES = {
  /** Toutes les routes API, par adresse IP */
  "api.ip": rule(300, 60, "Trop de requêtes depuis cette adresse."),
  /** Toutes les routes API, par utilisateur connecté */
  "api.user": rule(600, 60, "Trop de requêtes pour ce compte."),
  /** Page et PDF publics d'un devis, par adresse IP */
  "public.view": rule(60, 60, "Trop de consultations depuis cette adresse."),
  /** Réponse du client à un devis, par adresse IP */
  "public.respond": rule(10, 600, "Trop de réponses envoyées depuis cette adresse."),
  /** Création de compte, par adresse IP */
  "account.register": rule(5, 3600, "Trop de comptes créés depuis cette adresse."),
  /** Demande de réinitialisation du mot de passe, par adresse e-mail */
  "account.reset": rule(3, 3600, "Trop de demandes de réinitialisation pour cette adresse."),
  /** E-mails envoyés aux clients (devis, factures), par entreprise */
  "mail.send": rule(60, 3600, "Trop d'e-mails envoyés en peu de temps."),
  /** Assistant de préparation, par entreprise */
  "assistant.burst": rule(10, 60, "Trop de demandes à l'assistant de préparation."),
  /** Imports et exports de fichiers, par entreprise */
  "files.transfer": rule(30, 3600, "Trop d'imports ou d'exports en peu de temps."),
  /** API publique, par clé d'accès */
  "api.key": rule(120, 60, "Trop de requêtes pour cette clé d'API : 120 par minute au plus."),
  /** Messages et demandes de modification envoyés par les clients, par adresse IP */
  "public.message": rule(20, 3600, "Trop de messages envoyés depuis cette adresse."),
  /** Photos du journal de chantier, par entreprise */
  "job.photo": rule(300, 3600, "Trop de photos envoyées en peu de temps."),
} as const;

export type RateBucket = keyof typeof RATE_RULES;

/** Désactivable pour les tests de bout en bout qui enchaînent les requêtes. */
const disabled = () => process.env.RATE_LIMIT === "off";

/**
 * Compte un passage et refuse au-delà de la limite (erreur 429 avec le délai
 * d'attente). Une clé vide ne compte pas : rien à limiter sans identifiant.
 */
export async function hitRate(db: Queryable, bucket: RateBucket, key: string, now = new Date()) {
  if (disabled() || !key) return;
  const r = RATE_RULES[bucket];
  const start = Math.floor(now.getTime() / 1000 / r.windowSec) * r.windowSec;
  const row = (
    await db.query<{ count: unknown }>(
      `INSERT INTO rate_limits (bucket, key, window_start, count) VALUES ($1, $2, to_timestamp($3), 1)
       ON CONFLICT (bucket, key, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [bucket, key.slice(0, 200), start],
    )
  )[0];
  if (num(row?.count) > r.limit) {
    const retryAfter = Math.max(1, start + r.windowSec - Math.floor(now.getTime() / 1000));
    throw new HttpError(429, "rate_limited", r.message, { retryAfter });
  }
}

/** Purge des fenêtres terminées depuis plus d'un jour. */
export async function purgeRateLimits(db: Queryable) {
  const r = await db.query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' RETURNING 1");
  return r.length;
}
