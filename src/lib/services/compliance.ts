/**
 * Contrôle des informations obligatoires avant émission (section 4.1).
 *
 * Les règles sont versionnées. Elles aident l'artisan mais ne garantissent pas
 * la conformité juridique : elles doivent être validées et tenues à jour par un
 * professionnel compétent pour chaque métier.
 */

import { findAnomalies, type AnomalyLine } from "./anomalies";
import type { CalcResult } from "@/lib/calc/engine";
import { formatPercent } from "@/lib/calc/format";
import { isContractPlace, withdrawalApplies } from "./consumer";
import { REVERSE_CHARGE_MENTION, retentionBp, retentionMention } from "./btp";
import { frequentOmissions } from "./omissions";

export const COMPLIANCE_RULES_VERSION = "2026-10-v2";

export interface ComplianceIssue {
  code: string;
  message: string;
  blocking: boolean;
  field?: string;
}

export interface ComplianceInput {
  org: {
    trade_name: string;
    legal_name: string;
    address_line1: string;
    postal_code: string;
    city: string;
    siren: string;
    siret: string;
    vat_number: string;
    vat_regime: "normal" | "franchise";
    phone: string;
    email: string;
    insurance_decennale: boolean;
    insurance_name: string;
    insurance_policy: string;
    insurance_area: string;
    insurance_coverage: string;
    hourly_rate: string;
    travel_fee: string;
    trade: string;
    mediator_name?: string;
    mediator_url?: string;
  };
  customer: null | {
    type: string;
    name: string;
    billing_line1: string;
    billing_postal_code: string;
    billing_city: string;
    siren: string;
    vat_number?: string;
  };
  quote: {
    title: string;
    description: string;
    site_line1: string;
    site_postal_code: string;
    site_city: string;
    validity_days: number;
    payment_terms: string;
    deposit_percent?: string;
    contract_place?: string;
    reverse_charge?: boolean;
    retention_percent?: string;
  };
  lines: (AnomalyLine & { estimated: boolean })[];
  calc: CalcResult;
}

const DECENNALE_TRADES = /carrel|ma[cç]on|plomb|[ée]lectri|charpent|couv|menuis|pl[âa]tr|isol|gros|toiture|fa[cç]ade|chauff|terrass|piscine/i;

export function checkCompliance(i: ComplianceInput): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];
  const block = (code: string, message: string, field?: string) => out.push({ code, message, blocking: true, field });
  const warn = (code: string, message: string, field?: string) => out.push({ code, message, blocking: false, field });

  // Entreprise
  if (!i.org.trade_name.trim()) block("org_name", "Nom de l'entreprise manquant (profil entreprise)", "org.trade_name");
  if (!i.org.address_line1.trim() || !i.org.postal_code.trim() || !i.org.city.trim()) {
    block("org_address", "Adresse de l'entreprise incomplète (profil entreprise)", "org.address");
  }
  if (!i.org.siret.trim() && !i.org.siren.trim()) block("org_siret", "SIRET de l'entreprise manquant (profil entreprise)", "org.siret");
  if (!i.org.phone.trim() && !i.org.email.trim()) warn("org_contact", "Aucun téléphone ni e-mail professionnel dans le profil");
  if (i.org.vat_regime === "normal" && !i.org.vat_number.trim()) {
    warn("org_vat_number", "Numéro de TVA intracommunautaire absent : vérifiez s'il doit figurer sur vos documents");
  }

  // Assurance
  if (i.org.insurance_decennale) {
    if (!i.org.insurance_name.trim() || !i.org.insurance_policy.trim() || !i.org.insurance_area.trim()) {
      block(
        "insurance",
        "Assurance décennale déclarée mais incomplète : assureur, numéro de contrat et couverture géographique sont à indiquer",
        "org.insurance",
      );
    }
  } else if (DECENNALE_TRADES.test(i.org.trade)) {
    warn("insurance_missing", "Votre métier relève généralement de l'assurance décennale : renseignez-la dans le profil si elle s'applique");
  }

  // Client et chantier
  if (!i.customer) block("customer", "Aucun client sélectionné", "customer");
  else {
    if (!i.customer.name.trim()) block("customer_name", "Nom du client manquant", "customer");
    if (!i.customer.billing_line1.trim() || !i.customer.billing_city.trim()) {
      block("customer_address", "Adresse du client incomplète", "customer");
    }
    if (i.customer.type === "particulier" && !(i.org.mediator_name ?? "").trim()) {
      warn(
        "mediator",
        "Client particulier : indiquez votre médiateur de la consommation dans le profil entreprise (article L616-1 du Code de la consommation)",
      );
    }
    if (i.customer.type === "entreprise" && !i.customer.siren.trim()) {
      warn("customer_siren", "Client professionnel sans SIREN");
    }
  }
  if (!i.quote.site_line1.trim() || !i.quote.site_city.trim()) block("site", "Lieu d'exécution des travaux manquant", "site");
  if (!i.quote.title.trim()) block("title", "Objet des travaux manquant", "title");
  if (i.quote.description.trim().length < 15) warn("description", "Description des travaux très courte : soyez précis sur les prestations");

  // Conditions
  if (!(i.quote.validity_days > 0)) block("validity", "Durée de validité du devis manquante", "validity_days");
  if (!i.quote.payment_terms.trim()) block("payment_terms", "Conditions de paiement manquantes", "payment_terms");

  // Lignes et calculs
  for (const issue of i.calc.issues) {
    out.push({
      code: "calc_" + issue.code,
      message: issue.message,
      blocking: issue.blocking,
      field: issue.lineId ? "line:" + issue.lineId : undefined,
    });
  }
  const items = i.lines.filter((l) => l.kind === "item");
  if (items.some((l) => l.nature === "main_oeuvre") && !i.org.hourly_rate.trim()) {
    warn("hourly_rate", "Main-d'œuvre présente : indiquez votre taux horaire et les modalités de décompte du temps (profil entreprise)");
  }
  if (items.some((l) => l.nature === "deplacement") && !i.org.travel_fee.trim()) {
    warn("travel_fee", "Frais de déplacement présents : précisez leurs modalités dans le profil entreprise");
  }
  const estimated = items.filter((l) => l.estimated);
  if (estimated.length) {
    warn("estimated", `${estimated.length} ligne(s) avec quantité ou prix estimé(e) : vérifiez avant d'émettre`);
  }
  // Sous-traitance : autoliquidation de la TVA
  if (i.quote.reverse_charge) {
    if (i.org.vat_regime === "franchise") {
      block("reverse_charge_franchise", "Autoliquidation impossible en franchise en base de TVA : décochez la sous-traitance", "reverse_charge");
    } else if (i.customer && i.customer.type === "particulier") {
      block("reverse_charge_customer", "Autoliquidation réservée à un donneur d'ordre professionnel : le client est un particulier", "reverse_charge");
    } else if (i.customer && !i.customer.vat_number?.trim()) {
      warn("reverse_charge_vat_number", "Autoliquidation : indiquez le numéro de TVA de l'entreprise cliente dans sa fiche", "customer");
    }
  }
  if (retentionBp(i.quote.retention_percent) === null) {
    block("retention", "Retenue de garantie : 5 % du montant TTC au plus", "retention_percent");
  }
  if (i.org.vat_regime === "normal" && !i.quote.reverse_charge) {
    const reduced = new Set(i.calc.vatGroups.filter((g) => g.vatBp > 0 && g.vatBp < 2000).map((g) => g.vatBp));
    for (const bp of reduced) {
      warn(
        "reduced_vat_" + bp,
        `TVA à ${formatPercent(bp)} : vérifiez que les conditions du taux réduit sont remplies (logement achevé depuis plus de 2 ans, nature des travaux). Le client les atteste en acceptant le devis.`,
      );
    }
  }
  // Contrat conclu hors établissement avec un consommateur
  const place = isContractPlace(i.quote.contract_place) ? i.quote.contract_place : "auto";
  if (i.customer && withdrawalApplies(place, i.customer.type)) {
    const deposit = Number((i.quote.deposit_percent ?? "").replace(",", ".")) || 0;
    if (deposit > 0) {
      warn(
        "withdrawal_deposit",
        "Contrat hors établissement : aucun acompte ne peut être encaissé avant sept jours après la signature (article L221-10 du Code de la consommation)",
        "deposit_percent",
      );
    }
  }
  for (const o of frequentOmissions(i.lines, { travelFee: i.org.travel_fee })) warn("omission_" + o.code, o.message);
  for (const a of findAnomalies(i.lines, { vatApplies: i.org.vat_regime === "normal" && !i.quote.reverse_charge })) {
    warn("anomaly_" + a.code, a.message, a.lineId ? "line:" + a.lineId : undefined);
  }
  if (i.calc.margin.linesWithoutCost > 0 && items.length > 0) {
    warn("no_cost", `${i.calc.margin.linesWithoutCost} ligne(s) sans coût interne : la marge prévisionnelle est incomplète`);
  }
  return out;
}

/** Mentions imprimées sur le devis selon le contexte. */
export function buildMentions(
  i: Pick<ComplianceInput, "org" | "customer"> & { validUntil: string; depositPercent: string; reverseCharge?: boolean; retentionPercent?: string },
): string[] {
  const m: string[] = [];
  m.push(`Devis valable jusqu'au ${i.validUntil}.`);
  if (i.org.vat_regime === "franchise") m.push("TVA non applicable, article 293 B du Code général des impôts.");
  else if (i.reverseCharge) m.push(REVERSE_CHARGE_MENTION);
  if (i.org.hourly_rate.trim()) m.push(`Taux horaire de main-d'œuvre : ${i.org.hourly_rate.trim()}.`);
  if (i.org.travel_fee.trim()) m.push(`Frais de déplacement : ${i.org.travel_fee.trim()}.`);
  if (i.org.insurance_name.trim()) {
    const parts = [
      `Assurance ${i.org.insurance_decennale ? "décennale" : "professionnelle"} : ${i.org.insurance_name.trim()}`,
      i.org.insurance_policy.trim() ? `contrat n° ${i.org.insurance_policy.trim()}` : "",
      i.org.insurance_area.trim() ? `couverture géographique : ${i.org.insurance_area.trim()}` : "",
      i.org.insurance_coverage.trim() ? `garanties : ${i.org.insurance_coverage.trim()}` : "",
    ].filter(Boolean);
    m.push(parts.join(", ") + ".");
  }
  if (i.depositPercent.trim() && i.depositPercent.trim() !== "0") {
    m.push(`Un acompte de ${i.depositPercent.trim().replace(".", ",")} % du montant TTC est demandé à la signature.`);
  }
  const retention = retentionBp(i.retentionPercent);
  if (retention) m.push(retentionMention(retention));
  if (i.customer?.type === "particulier" && (i.org.mediator_name ?? "").trim()) {
    const site = (i.org.mediator_url ?? "").trim();
    m.push(
      `En cas de litige, le client consommateur peut recourir gratuitement au médiateur de la consommation : ${i.org.mediator_name!.trim()}${site ? ", " + site : ""} (articles L611-1 et suivants du Code de la consommation).`,
    );
  }
  if (i.customer && i.customer.type !== "particulier") {
    m.push(
      "En cas de retard de paiement : pénalités au taux légal en vigueur et indemnité forfaitaire de 40 euros pour frais de recouvrement (article L441-10 du Code de commerce).",
    );
  }
  return m;
}
