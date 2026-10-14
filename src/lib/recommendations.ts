/**
 * Recommandations entre métiers complémentaires.
 *
 * Le plombier qui refait une salle de bains connaît le besoin en carrelage ; l'électricien voit passer
 * des chantiers d'isolation. Un membre d'un réseau transmet un client, avec son accord, à un confrère
 * d'un métier qui complète le sien. Le métier libre de l'entreprise est rapproché des corps d'état connus.
 */

import { z } from "zod";
import { TRADES, tradeByKey } from "@/lib/coordination";

/** Mots repérés dans le métier saisi librement, vers les corps d'état de la coordination. */
const KEYWORDS: [RegExp, string][] = [
  [/plomb|chauff|sanitaire|g[ée]nie climatique|pompe [àa] chaleur/i, "plomberie"],
  [/[ée]lectri|domotique/i, "electricite"],
  [/ventil|vmc/i, "ventilation"],
  [/carrel|fa[ïi]ence/i, "carrelage"],
  [/peint|d[ée]cor|rev[êe]tements? muraux/i, "peinture"],
  [/ma[çc]on|gros (oe|œ)uvre/i, "maconnerie"],
  [/charpent|couv(r|e)|toiture|zingu/i, "charpente"],
  [/isol|pl[âa]tr|plaqu|cloison/i, "isolation"],
  [/chape|ragr[ée]age/i, "chape"],
  [/parquet|sols? souples?|moquette/i, "sols"],
  [/fen[êe]tre|menuiseries? ext|volet|v[ée]randa/i, "menuiseries_ext"],
  [/menuis|agenc|cuisin|ébénist|ebenist/i, "menuiseries_int"],
  [/d[ée]moli|d[ée]samiant/i, "demolition"],
  [/nettoy/i, "nettoyage"],
];

/** Métiers qui travaillent souvent sur les mêmes chantiers, dans les deux sens. */
const PAIRS: [string, string][] = [
  ["plomberie", "carrelage"],
  ["plomberie", "electricite"],
  ["plomberie", "isolation"],
  ["plomberie", "menuiseries_int"],
  ["electricite", "isolation"],
  ["electricite", "ventilation"],
  ["electricite", "menuiseries_int"],
  ["isolation", "peinture"],
  ["isolation", "menuiseries_ext"],
  ["isolation", "charpente"],
  ["carrelage", "chape"],
  ["carrelage", "maconnerie"],
  ["peinture", "sols"],
  ["chape", "sols"],
  ["maconnerie", "charpente"],
  ["maconnerie", "demolition"],
  ["menuiseries_ext", "maconnerie"],
  ["ventilation", "isolation"],
  ["demolition", "nettoyage"],
];

/** Corps d'état reconnu dans le métier saisi par l'entreprise, ou null. */
export function tradeKeyOf(trade: string): string | null {
  const t = trade.trim();
  if (!t) return null;
  const exact = TRADES.find((x) => x.key === t || x.label.toLowerCase() === t.toLowerCase());
  if (exact && exact.key !== "autre") return exact.key;
  return KEYWORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

export function complementsOf(key: string | null): string[] {
  if (!key) return [];
  return PAIRS.flatMap(([a, b]) => (a === key ? [b] : b === key ? [a] : []));
}

/** Les deux métiers se complètent-ils ? Un même métier n'est pas complémentaire. */
export function isComplementary(mine: string, theirs: string): boolean {
  const a = tradeKeyOf(mine);
  const b = tradeKeyOf(theirs);
  return !!a && !!b && a !== b && complementsOf(a).includes(b);
}

export interface MemberLike {
  orgId: string;
  name: string;
  trade: string;
  city: string;
}

/** Membres à qui recommander un client : métiers complémentaires d'abord, puis autres métiers, puis le même métier. */
export function rankTargets<T extends MemberLike>(myTrade: string, members: T[]): (T & { complementary: boolean; tradeLabel: string })[] {
  const mine = tradeKeyOf(myTrade);
  const score = (m: T) => (isComplementary(myTrade, m.trade) ? 0 : tradeKeyOf(m.trade) && tradeKeyOf(m.trade) === mine ? 2 : 1);
  return [...members]
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "fr"))
    .map((m) => {
      const key = tradeKeyOf(m.trade);
      return { ...m, complementary: isComplementary(myTrade, m.trade), tradeLabel: m.trade || (key ? (tradeByKey(key)?.label ?? "") : "") };
    });
}

export const RECO_STATUSES = { envoyee: "En attente", acceptee: "Acceptée", declinee: "Déclinée" } as const;
export type RecoStatus = keyof typeof RECO_STATUSES;

export const recoSchema = z
  .object({
    toOrg: z.string().uuid("Choisissez le confrère"),
    customerName: z.string().trim().min(2, "Indiquez le nom du client").max(160),
    email: z.string().trim().max(254).default(""),
    phone: z.string().trim().max(30).default(""),
    city: z.string().trim().max(120).default(""),
    need: z.string().trim().min(10, "Décrivez le besoin du client en une phrase au moins").max(2000),
    consent: z.literal(true, { message: "Le client doit avoir accepté d'être contacté par ce confrère" }),
  })
  .refine((r) => r.email || r.phone, { message: "Indiquez au moins un téléphone ou une adresse e-mail", path: ["phone"] });
