/**
 * Entreprises établies en Belgique, en Suisse ou au Luxembourg : taux de TVA, identifiant d'entreprise,
 * numéro de TVA, code postal et mentions propres à chaque pays. La France reste la règle par défaut.
 */

import type { CalcIssue } from "@/lib/calc/engine";

export type CountryCode = "FR" | "BE" | "CH" | "LU";

export interface CountryRules {
  code: CountryCode;
  label: string;
  /** Taux de TVA proposés dans l'éditeur, tels que saisis (virgule décimale) */
  vatOptions: string[];
  /** Taux autorisés en points de base */
  vatRatesBp: number[];
  companyIdLabel: string;
  companyIdHint: string;
  vatHint: string;
  /** Mentions à rappeler sur les devis et factures */
  mentions: string[];
}

export const COUNTRIES: Record<CountryCode, CountryRules> = {
  FR: {
    code: "FR",
    label: "France",
    vatOptions: ["20", "10", "5,5", "2,1", "0"],
    vatRatesBp: [2000, 1000, 550, 210, 0],
    companyIdLabel: "SIRET",
    companyIdHint: "14 chiffres",
    vatHint: "FR suivi de 11 caractères",
    mentions: [],
  },
  BE: {
    code: "BE",
    label: "Belgique",
    vatOptions: ["21", "12", "6", "0"],
    vatRatesBp: [2100, 1200, 600, 0],
    companyIdLabel: "Numéro d'entreprise (BCE)",
    companyIdHint: "10 chiffres, par exemple 0123.456.749",
    vatHint: "BE suivi des 10 chiffres du numéro d'entreprise",
    mentions: [
      "Taux de 6 % : rénovation d'un logement privé de plus de 10 ans, sur attestation du client remise avant la facturation.",
      "Autoliquidation entre entrepreneurs enregistrés : « Autoliquidation, article 20 de l'arrêté royal n° 1 ».",
    ],
  },
  CH: {
    code: "CH",
    label: "Suisse",
    vatOptions: ["8,1", "3,8", "2,6", "0"],
    vatRatesBp: [810, 380, 260, 0],
    companyIdLabel: "Numéro IDE",
    companyIdHint: "CHE suivi de 9 chiffres, par exemple CHE-109.322.551",
    vatHint: "Numéro IDE suivi de TVA, MWST ou IVA",
    mentions: [
      "Les montants sont calculés en euros : indiquez la contre-valeur en francs suisses (CHF) avec le taux appliqué.",
      "Entreprise non assujettie (chiffre d'affaires inférieur à 100 000 CHF) : ne facturez pas de TVA.",
    ],
  },
  LU: {
    code: "LU",
    label: "Luxembourg",
    vatOptions: ["17", "14", "8", "3", "0"],
    vatRatesBp: [1700, 1400, 800, 300, 0],
    companyIdLabel: "Numéro RCS",
    companyIdHint: "Lettre et chiffres, par exemple B123456",
    vatHint: "LU suivi de 8 chiffres",
    mentions: ["Taux de 3 % : création ou rénovation d'un logement affecté à l'habitation principale, sur agrément de l'Administration de l'enregistrement."],
  },
};

const ALIASES: Record<string, CountryCode> = {
  france: "FR",
  fr: "FR",
  belgique: "BE",
  be: "BE",
  belgie: "BE",
  belgië: "BE",
  suisse: "CH",
  ch: "CH",
  schweiz: "CH",
  svizzera: "CH",
  luxembourg: "LU",
  lu: "LU",
  "grand-duché de luxembourg": "LU",
};

/** Pays saisi librement vers son code ; la France par défaut. */
export function countryOf(raw: string | null | undefined): CountryCode {
  return ALIASES[(raw ?? "").trim().toLowerCase()] ?? "FR";
}

export const rulesFor = (raw: string | null | undefined) => COUNTRIES[countryOf(raw)];

const digits = (v: string) => v.replace(/\D/g, "");

function belgianNumberOk(n: string): boolean {
  if (!/^[01]\d{9}$/.test(n)) return false;
  return 97 - (Number(n.slice(0, 8)) % 97) === Number(n.slice(8));
}

function swissUidOk(n: string): boolean {
  if (!/^\d{9}$/.test(n)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4];
  const sum = w.reduce((s, x, i) => s + x * Number(n[i]), 0);
  const check = 11 - (sum % 11);
  if (check === 10) return false;
  return (check === 11 ? 0 : check) === Number(n[8]);
}

/** Contrôle de l'identifiant d'entreprise d'un pays étranger ; null si correct ou vide. */
export function validateCompanyId(code: CountryCode, raw: string): string | null {
  const v = raw.trim();
  if (!v || code === "FR") return null;
  if (code === "BE") return belgianNumberOk(digits(v)) ? null : "Numéro d'entreprise belge invalide (10 chiffres, clé de contrôle)";
  if (code === "CH") {
    const m = v.toUpperCase().replace(/[\s.-]/g, "");
    return /^CHE\d{9}$/.test(m) && swissUidOk(m.slice(3)) ? null : "Numéro IDE invalide (CHE suivi de 9 chiffres)";
  }
  return /^[A-Z]\d{1,6}$/.test(v.toUpperCase().replace(/\s/g, ""))
    ? null
    : "Numéro RCS luxembourgeois attendu (une lettre et des chiffres, par exemple B123456)";
}

/** Contrôle du numéro de TVA d'un pays étranger ; null si correct ou vide. */
export function validateForeignVat(code: CountryCode, raw: string): string | null {
  const v = raw.toUpperCase().replace(/[\s.-]/g, "");
  if (!v || code === "FR") return null;
  if (code === "BE") return /^BE\d{10}$/.test(v) && belgianNumberOk(v.slice(2)) ? null : "Numéro de TVA belge attendu : BE et 10 chiffres";
  if (code === "CH") return /^CHE\d{9}(TVA|MWST|IVA)$/.test(v) && swissUidOk(v.slice(3, 12)) ? null : "Numéro de TVA suisse attendu : CHE-123.456.789 TVA";
  if (!/^LU\d{8}$/.test(v)) return "Numéro de TVA luxembourgeois attendu : LU et 8 chiffres";
  return Number(v.slice(2, 8)) % 89 === Number(v.slice(8)) ? null : "Clé du numéro de TVA luxembourgeois incorrecte";
}

/** Code postal du pays : 5 chiffres en France, 4 en Belgique, en Suisse et au Luxembourg (L-1234 accepté). */
export function validateCountryPostalCode(code: CountryCode, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (code === "FR") return /^\d{5}$/.test(v) ? null : "Code postal à 5 chiffres attendu";
  if (code === "LU") return /^(L-?)?\d{4}$/i.test(v) ? null : "Code postal luxembourgeois à 4 chiffres attendu";
  return /^\d{4}$/.test(v) ? null : `Code postal ${code === "BE" ? "belge" : "suisse"} à 4 chiffres attendu`;
}

/** Ligne d'identification de l'entreprise sur les documents. */
export function companyIdLine(org: { country?: string; siret: string; siren: string }): string {
  const r = rulesFor(org.country);
  if (r.code === "FR") return org.siret ? `SIRET ${org.siret}` : org.siren ? `SIREN ${org.siren}` : "";
  const id = org.siren || org.siret;
  return id ? `${r.code === "BE" ? "N° d'entreprise" : r.code === "CH" ? "IDE" : "RCS"} ${id}` : "";
}

/** Avertissement si le devis d'une entreprise étrangère utilise des taux de TVA d'un autre pays. */
export function countryVatIssues(raw: string | null | undefined, vatBps: number[], vatExempt = false, rules?: CountryRules): CalcIssue[] {
  const r = rules ?? rulesFor(raw);
  // La France garde ses propres contrôles, sauf si une version publiée modifie ses taux.
  if ((r.code === "FR" && r === COUNTRIES.FR) || vatExempt) return [];
  const wrong = [...new Set(vatBps)].filter((v) => !r.vatRatesBp.includes(v));
  if (!wrong.length) return [];
  return [
    {
      code: "country_vat",
      blocking: false,
      message: `Entreprise établie ${r.code === "LU" ? "au Luxembourg" : `en ${r.label}`} : les taux ${wrong
        .map((v) => `${(v / 100).toLocaleString("fr-FR")} %`)
        .join(", ")} ne font pas partie des taux du pays (${r.vatOptions.join(" %, ")} %).`,
    },
  ];
}

/** Version des règles d'un pays publiée par l'administration, applicable à partir d'une date, sans nouvelle version du logiciel. */
export interface RuleVersion {
  country: CountryCode;
  /** AAAA-MM-JJ */
  effectiveFrom: string;
  vatOptions: string[];
  mentions: string[];
  note: string;
}

export const isCountryCode = (v: string): v is CountryCode => v in COUNTRIES;

/** Liste de taux saisie librement (« 21 ; 12 ; 6 ; 0 ») : taux affichés et points de base, ou message d'erreur. */
export function parseVatList(raw: string): { options: string[]; bps: number[] } | string {
  const parts = raw
    .split(/[;\s/|]+/)
    .map((p) => p.trim().replace(/%$/, "").replace(".", ","))
    .filter(Boolean);
  if (!parts.length) return "Indiquez au moins un taux de TVA";
  const options: string[] = [];
  const bps: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,2}(,\d{1,2})?$/.test(p)) return `Taux illisible : ${p}`;
    const bp = Math.round(Number(p.replace(",", ".")) * 100);
    if (bp > 3000) return `Taux trop élevé : ${p} %`;
    if (!bps.includes(bp)) {
      bps.push(bp);
      options.push(p);
    }
  }
  return { options, bps };
}

/** Règles du pays à une date : la dernière version publiée déjà en vigueur l'emporte sur les règles livrées avec le logiciel. */
export function applyRuleVersions(code: CountryCode, versions: RuleVersion[], onDate: string): CountryRules & { version: RuleVersion | null } {
  const base = COUNTRIES[code];
  const v =
    versions
      .filter((x) => x.country === code && x.effectiveFrom <= onDate)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null;
  if (!v) return { ...base, version: null };
  const parsed = parseVatList(v.vatOptions.join(";"));
  const vat = typeof parsed === "string" ? { options: base.vatOptions, bps: base.vatRatesBp } : parsed;
  return { ...base, vatOptions: vat.options, vatRatesBp: vat.bps, mentions: v.mentions, version: v };
}

/** Prochaine version programmée d'un pays (date future), pour prévenir avant le changement. */
export function nextRuleVersion(code: CountryCode, versions: RuleVersion[], onDate: string): RuleVersion | null {
  return (
    versions.filter((x) => x.country === code && x.effectiveFrom > onDate).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0] ?? null
  );
}
