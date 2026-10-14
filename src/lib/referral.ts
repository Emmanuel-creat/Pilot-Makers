/**
 * Parrainage entre clients (fonctions pures) : code personnel, état d'une recommandation et réglages du
 * programme.
 */

/** Lettres et chiffres sans ambiguïté à la lecture (ni 0/O, ni 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Code lisible : début du nom, puis quatre caractères tirés au hasard. Ex. : MARTIN-7K3F. */
export function makeReferralCode(name: string, random: () => number = Math.random) {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 8) || "CLIENT";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `${base}-${tail}`;
}

export const normalizeCode = (code: string) =>
  code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 20);

export type ReferralState = "en_cours" | "gagne" | "perdu" | "recompense";
export const REFERRAL_STATES: Record<ReferralState, string> = {
  en_cours: "Demande en cours",
  gagne: "Devis signé : récompense à remettre",
  perdu: "Sans suite",
  recompense: "Récompense remise",
};

export function referralState(r: { leadStatus: string; quoteStatus: string | null; rewardedAt: unknown }): ReferralState {
  if (r.rewardedAt) return "recompense";
  if (r.leadStatus === "gagnee" || r.quoteStatus === "accepted") return "gagne";
  if (r.leadStatus === "perdue" || r.quoteStatus === "refused" || r.quoteStatus === "expired") return "perdu";
  return "en_cours";
}

export interface ReferralSettings {
  enabled: boolean;
  /** Ce que reçoit le client parrain quand le devis du filleul est signé */
  referrerReward: string;
  /** Ce que reçoit le nouveau client recommandé */
  refereeReward: string;
}

export function readReferralSettings(raw: unknown): ReferralSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, d: string) => (typeof v === "string" ? v.slice(0, 200) : d);
  return {
    enabled: r.enabled === true,
    referrerReward: text(r.referrerReward, "50 € de remise sur votre prochaine facture"),
    refereeReward: text(r.refereeReward, "50 € de remise sur vos premiers travaux"),
  };
}
