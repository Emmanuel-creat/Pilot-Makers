/**
 * Transmission de l'entreprise : valorisation indicative à partir de l'historique tenu dans l'application, points
 * forts et points de vigilance pour un repreneur, étapes de la cession. Fonctions pures, montants en centimes.
 *
 * Deux méthodes usuelles pour une entreprise artisanale du bâtiment, croisées : un multiple de l'excédent moyen
 * (chiffre d'affaires moins achats et frais) et un pourcentage du chiffre d'affaires moyen. L'écart entre les deux
 * donne la fourchette ; les forces et faiblesses la déplacent. Ce n'est pas une évaluation d'expert.
 */

export interface TransferYear {
  year: number;
  revenueCents: number;
  costsCents: number;
}

export interface TransferInputs {
  /** Trois derniers exercices civils complets, du plus ancien au plus récent */
  years: TransferYear[];
  customers: number;
  /** Part des clients facturés au moins deux fois, entre 0 et 1 */
  repeatShare: number | null;
  topCustomerShare: number | null;
  backlogCents: number;
  /** Équipements de clients suivis en entretien (carnets de logement) */
  maintainedEquipments: number;
  reviewAverage: number | null;
  reviewCount: number;
  catalogItems: number;
  teamMembers: number;
  vehicles: number;
}

export interface Factor {
  key: string;
  label: string;
  /** Effet sur la valeur, en points de pourcentage (positif : valorise) */
  effect: number;
}

export interface Valuation {
  averageRevenueCents: number;
  averageSurplusCents: number;
  /** Évolution du chiffre d'affaires entre le premier et le dernier exercice, entre -1 et +∞ ; null sans base */
  growth: number | null;
  byMultipleCents: number;
  byRevenueCents: number;
  factors: Factor[];
  lowCents: number;
  highCents: number;
  midCents: number;
  /** Historique trop court ou trop maigre pour une valeur fiable */
  insufficient: boolean;
}

/** Multiple de l'excédent moyen et part du chiffre d'affaires retenus pour une entreprise artisanale du bâtiment */
export const SURPLUS_MULTIPLE = 3;
export const REVENUE_SHARE = 0.4;

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function transferFactors(i: TransferInputs, growth: number | null): Factor[] {
  const f: Factor[] = [];
  if (growth !== null && growth >= 0.1) f.push({ key: "croissance", label: "Chiffre d'affaires en croissance sur trois ans", effect: 10 });
  if (growth !== null && growth <= -0.1) f.push({ key: "baisse", label: "Chiffre d'affaires en baisse sur trois ans", effect: -10 });
  if (i.topCustomerShare !== null && i.topCustomerShare > 0.3)
    f.push({ key: "dependance", label: "Plus de 30 % du chiffre d'affaires avec un seul client", effect: -15 });
  if (i.repeatShare !== null && i.repeatShare >= 0.3) f.push({ key: "fidelite", label: "Clientèle fidèle : au moins 30 % des clients reviennent", effect: 5 });
  if (i.maintainedEquipments >= 20) f.push({ key: "entretien", label: "Équipements suivis en entretien : revenus récurrents", effect: 5 });
  if (i.reviewCount >= 10 && (i.reviewAverage ?? 0) >= 4.5)
    f.push({ key: "reputation", label: "Réputation établie : avis clients nombreux et excellents", effect: 5 });
  const lastRevenue = i.years.length ? i.years[i.years.length - 1].revenueCents : 0;
  if (lastRevenue > 0 && i.backlogCents >= lastRevenue / 4) f.push({ key: "carnet", label: "Au moins trois mois de travaux signés d'avance", effect: 5 });
  if (i.teamMembers <= 1) f.push({ key: "dirigeant", label: "Activité reposant sur le seul dirigeant", effect: -10 });
  return f;
}

export function valueBusiness(i: TransferInputs): Valuation {
  const years = i.years.filter((y) => y.revenueCents > 0);
  const averageRevenueCents = Math.round(avg(years.map((y) => y.revenueCents)));
  const averageSurplusCents = Math.round(avg(years.map((y) => y.revenueCents - y.costsCents)));
  const first = years[0]?.revenueCents ?? 0;
  const last = years[years.length - 1]?.revenueCents ?? 0;
  const growth = years.length >= 2 && first > 0 ? (last - first) / first : null;
  const byMultipleCents = Math.max(0, averageSurplusCents * SURPLUS_MULTIPLE);
  const byRevenueCents = Math.round(averageRevenueCents * REVENUE_SHARE);
  const factors = transferFactors(i, growth);
  const adjust = 1 + factors.reduce((s, f) => s + f.effect, 0) / 100;
  const low = Math.round(Math.min(byMultipleCents, byRevenueCents) * adjust);
  const high = Math.round(Math.max(byMultipleCents, byRevenueCents) * adjust);
  return {
    averageRevenueCents,
    averageSurplusCents,
    growth,
    byMultipleCents,
    byRevenueCents,
    factors,
    lowCents: Math.max(0, low),
    highCents: Math.max(0, high),
    midCents: Math.max(0, Math.round((low + high) / 2)),
    insufficient: years.length < 2 || averageRevenueCents < 1_000_000,
  };
}

/** Ce que l'historique de l'application apporte au repreneur, en clair. */
export function intangibleAssets(i: TransferInputs): string[] {
  const out: string[] = [];
  if (i.customers)
    out.push(
      `${i.customers} client${i.customers > 1 ? "s" : ""} facturé${i.customers > 1 ? "s" : ""} sur trois ans, avec l'historique de leurs devis, factures et chantiers`,
    );
  if (i.catalogItems) out.push(`Un catalogue de ${i.catalogItems} prix et ouvrages chiffrés, à jour des prix d'achat`);
  if (i.maintainedEquipments)
    out.push(
      `${i.maintainedEquipments} équipement${i.maintainedEquipments > 1 ? "s" : ""} de clients suivi${i.maintainedEquipments > 1 ? "s" : ""} en entretien, avec leurs échéances`,
    );
  if (i.reviewCount)
    out.push(`${i.reviewCount} avis client${i.reviewCount > 1 ? "s" : ""}, note moyenne ${(i.reviewAverage ?? 0).toFixed(1).replace(".", ",")} sur 5`);
  if (i.backlogCents) out.push("Un carnet de travaux signés, prêt à être repris");
  if (i.vehicles) out.push(`${i.vehicles} véhicule${i.vehicles > 1 ? "s" : ""} suivi${i.vehicles > 1 ? "s" : ""} (entretiens, contrôles)`);
  return out;
}

/** Étapes d'une cession d'entreprise artisanale, à adapter avec l'expert-comptable et la chambre de métiers. */
export const TRANSFER_STEPS = [
  "Préparer deux à trois ans à l'avance : comptes propres, contrats écrits, dépendances réduites.",
  "Faire évaluer l'entreprise par l'expert-comptable ou la chambre de métiers, ce dossier en appui.",
  "Choisir la forme : vente du fonds artisanal ou des parts sociales, transmission à un salarié ou à un proche.",
  "Diffuser l'annonce sur la bourse de la chambre de métiers ou de la fédération, en restant discret auprès des clients.",
  "Signer un engagement de confidentialité avant de remettre ce dossier à un repreneur sérieux.",
  "Informer les salariés au moins deux mois avant la vente (entreprise de moins de 250 salariés).",
  "Signer la promesse puis l'acte, publier la cession, transférer les contrats et l'assurance.",
  "Prévoir un accompagnement du repreneur : présentation aux clients, aux fournisseurs, passage des chantiers.",
  "Les garanties décennale et de parfait achèvement des travaux déjà réalisés restent attachées à l'entreprise qui les a faits.",
] as const;
