/**
 * Conseil financier personnalisé : à partir des chiffres de l'entreprise sur douze mois, des
 * recommandations chiffrées et classées par effet attendu sur la trésorerie ou le résultat.
 * Les montants sont des ordres de grandeur, à valider avec l'expert-comptable.
 */

import type { HealthFigures } from "@/lib/health-score";

export interface FinanceInputs extends HealthFigures {
  /** Solde bancaire saisi dans la trésorerie ; null si non renseigné */
  balanceCents: number | null;
  /** Charges fixes mensuelles saisies ; 0 si non renseignées */
  monthlyChargesCents: number;
  /** Devis acceptés sur douze mois et, parmi eux, ceux avec une facture d'acompte */
  acceptedCount: number;
  withDepositCount: number;
  /** Chiffre d'affaires HT des douze derniers mois, du plus ancien au plus récent */
  monthlyRevenueCents: number[];
}

export interface Recommendation {
  key: string;
  title: string;
  finding: string;
  actions: string[];
  /** Effet estimé en centimes (trésorerie libérée ou résultat gagné), null s'il n'est pas chiffrable */
  impactCents: number | null;
  /** 1 urgent, 2 important, 3 à surveiller */
  priority: 1 | 2 | 3;
  href: string;
}

const eur = (c: number) => `${Math.round(c / 100).toLocaleString("fr-FR")} €`;
const pct = (v: number) => `${Math.round(v * 100)} %`;
const TTC = 1.2;

export function adviseFinance(f: FinanceInputs): { recommendations: Recommendation[]; strengths: string[] } {
  const recs: Recommendation[] = [];
  const strengths: string[] = [];
  const dailyTtc = (f.revenueCents * TTC) / 365;

  if (f.paymentDays !== null && f.paymentDays > 30 && f.revenueCents > 0) {
    recs.push({
      key: "delai",
      title: "Raccourcir le délai de paiement de vos clients",
      finding: `Vos clients paient en ${Math.round(f.paymentDays)} jours en moyenne. Revenir à 30 jours libérerait environ ${eur(dailyTtc * (f.paymentDays - 30))} de trésorerie.`,
      actions: [
        "Indiquez une échéance à 30 jours au plus sur vos factures.",
        "Activez les relances automatiques avant et après l'échéance.",
        "Proposez le paiement par lien dès l'envoi.",
      ],
      impactCents: Math.round(dailyTtc * (f.paymentDays - 30)),
      priority: f.paymentDays > 45 ? 1 : 2,
      href: "/app/factures",
    });
  } else if (f.paymentDays !== null) strengths.push(`Vos clients paient vite : ${Math.round(f.paymentDays)} jours en moyenne.`);

  if (f.overdueCents > 0 && (f.overdueCents > f.revenueCents * TTC * 0.05 || f.overdueCents > 500000)) {
    recs.push({
      key: "retards",
      title: "Récupérer les factures en retard",
      finding: `${eur(f.overdueCents)} TTC sont échus et non payés, soit ${pct(f.overdueCents / Math.max(1, f.outstandingCents))} de ce qui vous est dû.`,
      actions: [
        "Appelez d'abord les plus gros montants.",
        "Envoyez une mise en demeure au-delà de 30 jours de retard.",
        "Utilisez le recouvrement pas à pas depuis la facture.",
      ],
      impactCents: f.overdueCents,
      priority: 1,
      href: "/app/factures",
    });
  }

  if (f.acceptedCount >= 3 && f.withDepositCount / f.acceptedCount < 0.5) {
    const impact = Math.round(f.backlogCents * TTC * 0.3);
    recs.push({
      key: "acomptes",
      title: "Demander un acompte à la signature",
      finding: `Seuls ${f.withDepositCount} devis acceptés sur ${f.acceptedCount} ont donné lieu à un acompte. Un acompte de 30 % sur les travaux signés restant à facturer représenterait ${eur(impact)}.`,
      actions: ["Prévoyez 30 % d'acompte dans vos conditions de paiement.", "Facturez l'acompte dès l'acceptation, avant de commander les matériaux."],
      impactCents: impact > 0 ? impact : null,
      priority: 2,
      href: "/app/devis",
    });
  }

  if (f.balanceCents !== null && f.monthlyChargesCents > 0) {
    const months = f.balanceCents / f.monthlyChargesCents;
    if (months < 2) {
      recs.push({
        key: "reserve",
        title: "Constituer une réserve de trésorerie",
        finding: `Votre solde couvre ${months < 0 ? "moins de zéro" : months.toFixed(1).replace(".", ",")} mois de charges fixes. Une réserve de trois mois demande encore ${eur(3 * f.monthlyChargesCents - f.balanceCents)}.`,
        actions: [
          "Mettez de côté une part fixe de chaque encaissement.",
          "Étalez les achats importants ou financez-les plutôt que de les payer comptant.",
          "Suivez le prévisionnel de trésorerie chaque mois.",
        ],
        impactCents: null,
        priority: months < 1 ? 1 : 2,
        href: "/app/rapports/tresorerie",
      });
    } else if (months >= 3) strengths.push(`Votre trésorerie couvre plus de trois mois de charges fixes.`);
  }

  const margin = f.revenueCents > 0 ? (f.revenueCents - f.costsCents) / f.revenueCents : null;
  if (margin !== null && margin < 0.35) {
    recs.push({
      key: "marge",
      title: "Remonter votre marge",
      finding: `Après achats et frais, il vous reste ${pct(margin)} du chiffre d'affaires. Une hausse de prix de 5 % sur un an représenterait ${eur(f.revenueCents * 0.05)} de résultat en plus.`,
      actions: [
        "Revoyez vos coefficients de vente par famille d'ouvrages.",
        "Comparez coûts prévus et réels sur les derniers chantiers.",
        "Facturez les travaux supplémentaires par avenant signé.",
      ],
      impactCents: Math.round(f.revenueCents * 0.05),
      priority: margin < 0.2 ? 1 : 2,
      href: "/app/rapports/simulateur",
    });
  } else if (margin !== null && margin >= 0.45) strengths.push(`Votre marge sur achats et frais est solide : ${pct(margin)}.`);

  if (f.topCustomerShare !== null && f.topCustomerShare > 0.3) {
    recs.push({
      key: "dependance",
      title: "Réduire la dépendance à un client",
      finding: `Votre premier client pèse ${pct(f.topCustomerShare)} de votre chiffre d'affaires : son départ ou un impayé de sa part toucherait toute l'entreprise.`,
      actions: [
        "Relancez vos anciens clients particuliers.",
        "Diversifiez vers un autre type de chantier.",
        "Vérifiez sa solvabilité et demandez des acomptes.",
      ],
      impactCents: null,
      priority: f.topCustomerShare > 0.5 ? 1 : 3,
      href: "/app/clients",
    });
  }

  const monthly = f.revenueCents / 12;
  if (f.revenueCents > 0 && f.backlogCents < monthly * 2) {
    recs.push({
      key: "carnet",
      title: "Remplir le carnet de commandes",
      finding: `Les travaux signés restant à facturer (${eur(f.backlogCents)} HT) représentent ${(f.backlogCents / monthly).toFixed(1).replace(".", ",")} mois d'activité.`,
      actions: [
        "Relancez les devis envoyés sans réponse.",
        "Recontactez les clients des chantiers terminés pour l'entretien.",
        "Répondez à des marchés publics de votre région.",
      ],
      impactCents: null,
      priority: f.backlogCents < monthly ? 1 : 2,
      href: "/app/devis",
    });
  } else if (f.revenueCents > 0) strengths.push(`Votre carnet couvre ${(f.backlogCents / monthly).toFixed(1).replace(".", ",")} mois d'activité.`);

  if (f.acceptance !== null && f.acceptance < 0.35) {
    recs.push({
      key: "transformation",
      title: "Signer plus de devis",
      finding: `${pct(f.acceptance)} de vos devis décidés sont acceptés.`,
      actions: [
        "Envoyez le devis dans les 48 heures après la visite.",
        "Relancez au bout d'une semaine.",
        "Proposez une option économique à côté de la solution conseillée.",
      ],
      impactCents: null,
      priority: 3,
      href: "/app/devis",
    });
  }

  const known = f.monthlyRevenueCents.filter((v) => v > 0);
  if (known.length >= 6) {
    const avg = known.reduce((s, v) => s + v, 0) / known.length;
    const low = Math.min(...f.monthlyRevenueCents);
    if (low < avg * 0.4) {
      recs.push({
        key: "saison",
        title: "Préparer les mois creux",
        finding: `Votre plus petit mois a fait ${eur(low)} HT contre ${eur(avg)} en moyenne : les charges fixes, elles, ne baissent pas.`,
        actions: [
          "Planifiez les travaux intérieurs et l'entretien sur ces mois.",
          "Mettez de côté pendant les mois forts.",
          "Anticipez la formation et les congés sur la période creuse.",
        ],
        impactCents: null,
        priority: 3,
        href: "/app/rapports/tresorerie",
      });
    }
  }

  recs.sort((a, b) => a.priority - b.priority || (b.impactCents ?? 0) - (a.impactCents ?? 0));
  return { recommendations: recs, strengths };
}
