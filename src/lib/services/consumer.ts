/**
 * Protection du client consommateur : droit de rétractation des contrats conclus
 * hors établissement et attestation du client pour les taux réduits de TVA.
 *
 * Fonctions pures, partagées par l'éditeur, le serveur, le PDF et la page client.
 * Les textes sont des modèles à faire valider par un juriste.
 */

import type { CalcResult } from "@/lib/calc/engine";
import { formatPercent } from "@/lib/calc/format";

/**
 * Lieu de conclusion du contrat :
 * - auto : hors établissement pour un client particulier, sinon non concerné ;
 * - hors_etablissement : signé au domicile du client, sur le chantier, ou après une visite ;
 * - etablissement : signé dans les locaux de l'entreprise, ou client professionnel.
 */
export const CONTRACT_PLACES = {
  auto: "Automatique selon le client",
  hors_etablissement: "Hors établissement (domicile du client, chantier)",
  etablissement: "Dans les locaux de l'entreprise",
} as const;
export type ContractPlace = keyof typeof CONTRACT_PLACES;

export function isContractPlace(v: unknown): v is ContractPlace {
  return typeof v === "string" && v in CONTRACT_PLACES;
}

export interface ConsumerTerms {
  /** Droit de rétractation de 14 jours applicable */
  withdrawal: boolean;
  /** Taux réduits de TVA présents (points de base), qui demandent l'attestation du client */
  reducedVatBp: number[];
}

export function withdrawalApplies(place: ContractPlace, customerType: string | null | undefined): boolean {
  if (place === "hors_etablissement") return customerType !== "entreprise";
  if (place === "etablissement") return false;
  return customerType === "particulier";
}

export function reducedVatRates(calc: Pick<CalcResult, "vatGroups">, vatRegime: "normal" | "franchise"): number[] {
  if (vatRegime === "franchise") return [];
  return [...new Set(calc.vatGroups.filter((g) => g.vatBp > 0 && g.vatBp < 2000).map((g) => g.vatBp))].sort((a, b) => a - b);
}

export function consumerTerms(
  place: ContractPlace,
  customerType: string | null | undefined,
  calc: Pick<CalcResult, "vatGroups">,
  vatRegime: "normal" | "franchise",
): ConsumerTerms {
  return { withdrawal: withdrawalApplies(place, customerType), reducedVatBp: reducedVatRates(calc, vatRegime) };
}

export const WITHDRAWAL_TEXT =
  "Le client consommateur dispose d'un délai de quatorze jours à compter de la conclusion du contrat pour exercer son droit de rétractation, " +
  "sans avoir à motiver sa décision (articles L221-18 et suivants du Code de la consommation). Il peut utiliser le formulaire joint ou " +
  "toute autre déclaration dénuée d'ambiguïté, adressée à l'entreprise avant l'expiration de ce délai.\n" +
  "Aucun paiement, acompte compris, ne peut être reçu avant l'expiration d'un délai de sept jours à compter de la conclusion du contrat.\n" +
  "Les travaux ne commencent pas avant la fin du délai de rétractation, sauf demande expresse du client. Dans ce cas, s'il se rétracte " +
  "ensuite, il verse un montant correspondant aux travaux réalisés jusqu'à sa rétractation.";

export function withdrawalForm(
  org: { trade_name: string; address_line1: string; address_line2: string; postal_code: string; city: string; email: string },
  quoteNumber: string,
): string {
  const address = [org.address_line1, org.address_line2, `${org.postal_code} ${org.city}`.trim()].filter((x) => x.trim()).join(", ");
  return [
    "Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.",
    "",
    `À l'attention de ${org.trade_name}${address ? ", " + address : ""}${org.email ? ", " + org.email : ""} :`,
    `Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services ci-dessous : devis ${quoteNumber}.`,
    "Accepté le : ........................................",
    "Nom du client : ........................................",
    "Adresse du client : ........................................",
    "Signature du client (uniquement en cas d'envoi sur papier) :",
    "",
    "Date : ........................................",
  ].join("\n");
}

export function reducedVatAttestation(rates: number[]): string {
  const list = rates.map((bp) => formatPercent(bp)).join(" et ");
  const parts = [
    `Ce devis applique un taux réduit de TVA (${list}). En l'acceptant, le client atteste que les travaux portent sur des locaux à usage d'habitation achevés depuis plus de deux ans, ` +
      "qu'ils n'entraînent pas la production d'un immeuble neuf au sens du 2° du 2 du I de l'article 257 du Code général des impôts, " +
      "ni une augmentation de plus de 10 % de la surface de plancher existante.",
  ];
  if (rates.includes(550)) {
    parts.push(
      "Pour les prestations à 5,5 %, il atteste en outre qu'elles portent sur des travaux d'amélioration de la qualité énergétique, ou des travaux induits et indissociablement liés (article 278-0 bis A du Code général des impôts).",
    );
  }
  parts.push("Le client conserve une copie de ce document. En cas d'information inexacte, il peut être tenu au paiement du complément de TVA.");
  return parts.join("\n");
}
