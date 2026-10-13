/**
 * Activation progressive des nouveautés, entreprise par entreprise.
 *
 * Ordre de décision pour une fonctionnalité et une entreprise :
 * 1. réglage forcé par l'administration de la plateforme (organizations.feature_flags) ;
 * 2. variable d'environnement FEATURE_<CLE> : "on", "off" ou un pourcentage (ex. "25") ;
 * 3. pourcentage de déploiement par défaut ci-dessous.
 * Le tirage est stable : une entreprise donnée reste dans le même groupe quand le pourcentage augmente.
 */

import { createHash } from "node:crypto";

export const FEATURES = {
  webhooks: {
    label: "Webhooks",
    description: "Envois signés vers les outils de l'entreprise (devis signé, facture payée, client créé).",
    rollout: 100,
  },
  revision_prix: { label: "Révision de prix", description: "Prix révisables selon les index BT sur les devis et les factures.", rollout: 100 },
  factures_structurees: { label: "Factures structurées", description: "Téléchargement des factures en Factur-X, XML CII et UBL.", rollout: 100 },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type FeatureOverride = "on" | "off";
export type FeatureFlags = Partial<Record<FeatureKey, FeatureOverride>>;

export const isFeatureKey = (k: string): k is FeatureKey => k in FEATURES;

/** Groupe stable de l'entreprise pour cette fonctionnalité, de 0 à 99. */
export function rolloutBucket(orgId: string, key: FeatureKey) {
  return parseInt(createHash("sha256").update(`${key}:${orgId}`).digest("hex").slice(0, 8), 16) % 100;
}

function envRollout(key: FeatureKey): number | null {
  const v = (process.env[`FEATURE_${key.toUpperCase()}`] ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "on") return 100;
  if (v === "off") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function rolloutPercent(key: FeatureKey) {
  return envRollout(key) ?? FEATURES[key].rollout;
}

export function featureEnabled(org: { id: string; feature_flags?: unknown }, key: FeatureKey): boolean {
  const flags = (org.feature_flags ?? {}) as FeatureFlags;
  if (flags[key] === "on") return true;
  if (flags[key] === "off") return false;
  return rolloutBucket(org.id, key) < rolloutPercent(key);
}

/** État de toutes les fonctionnalités pour une entreprise, avec la raison (affichage administration). */
export function featureStates(org: { id: string; feature_flags?: unknown }) {
  const flags = (org.feature_flags ?? {}) as FeatureFlags;
  return (Object.keys(FEATURES) as FeatureKey[]).map((key) => ({
    key,
    ...FEATURES[key],
    override: flags[key] ?? null,
    percent: rolloutPercent(key),
    bucket: rolloutBucket(org.id, key),
    enabled: featureEnabled(org, key),
  }));
}
