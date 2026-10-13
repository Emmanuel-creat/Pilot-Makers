/**
 * Aides à la rénovation : libellés, contrôles et mentions, sans accès à la base
 * (utilisés à l'identique par l'éditeur et par le serveur ; voir aids.ts).
 */

import { parseScaled } from "@/lib/calc/decimal";
import { formatEuros } from "@/lib/calc/format";
import type { ComplianceIssue } from "./compliance";

export const AID_PROGRAMS = {
  mpr: "MaPrimeRénov'",
  cee: "Certificats d'économies d'énergie (CEE)",
  ecoptz: "Éco-prêt à taux zéro",
} as const;
export type AidProgram = keyof typeof AID_PROGRAMS;

export const RGE_DOMAINS = {
  isolation_murs: "Isolation des murs",
  isolation_combles: "Isolation des combles et toitures",
  isolation_planchers: "Isolation des planchers bas",
  menuiseries: "Fenêtres, volets et portes extérieures",
  pac: "Pompes à chaleur",
  bois: "Chauffage au bois",
  solaire_thermique: "Chauffe-eau et chauffage solaires",
  photovoltaique: "Panneaux photovoltaïques",
  chaudiere: "Chaudières à haute performance",
  ventilation: "Ventilation",
  audit: "Audit énergétique",
  renovation_globale: "Rénovation globale",
} as const;
export type RgeDomain = keyof typeof RGE_DOMAINS;

export const RGE_BODIES = ["Qualibat", "Qualit'EnR", "Qualifelec", "Certibat", "Cequami", "Afnor Certification", "Opqibi", "Autre"] as const;

/** Dispositifs visés par un devis : vide ou absent pour un devis ordinaire. */
export interface EnergyAid {
  programs: AidProgram[];
  domains: RgeDomain[];
  /** Date de la visite préalable du logement (AAAA-MM-JJ) */
  visitDate: string;
  /** Montant total d'aides estimé, en euros TTC, vide si non chiffré */
  estimatedAid: string;
}

export interface RgeQualification {
  id: string;
  body: string;
  number: string;
  domains: RgeDomain[];
  valid_until: string;
}

/** Un devis sans dispositif coché n'en garde aucune trace. */
export function normalizeAid(a: EnergyAid | null | undefined): EnergyAid | null {
  if (!a || !a.programs.length) return null;
  return {
    programs: [...new Set(a.programs)],
    domains: [...new Set(a.domains)],
    visitDate: a.visitDate,
    estimatedAid: a.estimatedAid.trim(),
  };
}

export function aidCents(a: Pick<EnergyAid, "estimatedAid">): number | null {
  if (!a.estimatedAid) return null;
  try {
    const v = Number(parseScaled(a.estimatedAid, 2));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Contrôles et mentions                                               */
/* ------------------------------------------------------------------ */

/** Qualification valide à la date donnée qui couvre le domaine, la plus durable d'abord. */
export function coveringQualification(quals: RgeQualification[], domain: RgeDomain, onDate: string) {
  return quals.filter((q) => q.domains.includes(domain) && q.valid_until >= onDate).sort((a, b) => b.valid_until.localeCompare(a.valid_until))[0];
}

export function aidIssues(
  aid: EnergyAid | null,
  quals: RgeQualification[],
  issueDate: string,
  validUntil: string,
  totalTtcCents: number,
): ComplianceIssue[] {
  if (!aid?.programs.length) return [];
  const out: ComplianceIssue[] = [];
  if (!aid.domains.length) {
    out.push({
      code: "aid_domain",
      message: "Aides à la rénovation : indiquez le domaine des travaux pour contrôler la qualification RGE",
      blocking: true,
    });
  }
  for (const domain of aid.domains) {
    const q = coveringQualification(quals, domain, issueDate);
    if (!q) {
      const expired = quals.some((x) => x.domains.includes(domain));
      out.push({
        code: "aid_rge",
        message: `Aides à la rénovation : aucune qualification RGE ${expired ? "en cours de validité" : "enregistrée"} pour « ${RGE_DOMAINS[domain]} ». Le client ne pourrait pas obtenir les aides.`,
        blocking: true,
      });
    } else if (q.valid_until < validUntil) {
      out.push({
        code: "aid_rge_expiring",
        message: `Votre qualification RGE ${q.body} expire le ${frDate(q.valid_until)}, avant la fin de validité du devis : les travaux doivent être réalisés sous qualification valide`,
        blocking: false,
      });
    }
  }
  if (aid.programs.includes("mpr") && !aid.visitDate) {
    out.push({ code: "aid_visit", message: "MaPrimeRénov' : indiquez la date de la visite préalable du logement", blocking: true });
  } else if (aid.visitDate && aid.visitDate > issueDate) {
    out.push({ code: "aid_visit", message: "La date de visite préalable ne peut pas être postérieure à l'émission du devis", blocking: true });
  }
  const cents = aidCents(aid);
  if (aid.estimatedAid && cents === null) {
    out.push({ code: "aid_amount", message: "Montant d'aides estimé illisible", blocking: true });
  } else if (cents !== null && cents > totalTtcCents) {
    out.push({ code: "aid_amount", message: "Le montant d'aides estimé dépasse le total TTC du devis", blocking: true });
  }
  return out;
}

function frDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Mentions imprimées sur le devis : dispositifs, qualifications utilisées, visite, estimation et reste à charge. */
export function aidMentions(aid: EnergyAid | null, quals: RgeQualification[], issueDate: string, totalTtcCents: number): string[] {
  if (!aid?.programs.length) return [];
  const out = [`Travaux de rénovation énergétique pouvant bénéficier de : ${aid.programs.map((p) => AID_PROGRAMS[p]).join(", ")}.`];
  const used = new Map<string, { q: RgeQualification; domains: string[] }>();
  for (const d of aid.domains) {
    const q = coveringQualification(quals, d, issueDate);
    if (!q) continue;
    const e = used.get(q.id) ?? { q, domains: [] };
    e.domains.push(RGE_DOMAINS[d]);
    used.set(q.id, e);
  }
  for (const { q, domains } of used.values()) {
    out.push(
      `Entreprise qualifiée RGE : ${q.body}, qualification n° ${q.number} (${domains.join(", ")}), valable jusqu'au ${frDate(q.valid_until)}.`,
    );
  }
  if (aid.visitDate) out.push(`Visite préalable du logement effectuée le ${frDate(aid.visitDate)}.`);
  const cents = aidCents(aid);
  if (cents !== null && cents <= totalTtcCents) {
    out.push(
      `Montant d'aides estimé : ${formatEuros(cents)} ; reste à charge estimé : ${formatEuros(totalTtcCents - cents)} TTC. ` +
        "Estimation indicative : l'octroi et le montant définitif dépendent de l'instruction du dossier par les organismes.",
    );
  }
  if (aid.programs.includes("mpr")) out.push("La demande MaPrimeRénov' doit être déposée par le client avant le début des travaux.");
  if (aid.programs.includes("cee")) out.push("La prime CEE doit être demandée auprès de l'organisme choisi avant la signature du devis.");
  return out;
}
