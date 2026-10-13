/**
 * Journal des nouveautés livrées avec l'application, du plus récent au plus ancien.
 * Une entrée liée à une fonctionnalité en déploiement progressif n'apparaît qu'aux entreprises qui l'ont.
 */

import type { FeatureKey } from "./features";

export interface ChangelogEntry {
  id: string;
  /** Date de mise en ligne, AAAA-MM-JJ */
  date: string;
  title: string;
  text: string;
  href?: string;
  feature?: FeatureKey;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "webhooks",
    date: "2026-10-13",
    title: "Webhooks vers vos autres outils",
    text: "Prévenez automatiquement un tableur ou un outil d'automatisation quand un devis est signé, une facture payée ou un client créé.",
    href: "/aide/webhooks",
    feature: "webhooks",
  },
  {
    id: "revision-prix",
    date: "2026-10-13",
    title: "Prix révisables selon les index BT",
    text: "Sur un chantier long, la formule de révision est imprimée sur le devis et appliquée aux situations et au solde.",
    href: "/aide/revision-de-prix",
    feature: "revision_prix",
  },
  {
    id: "application-installable",
    date: "2026-10-13",
    title: "Application sur l'écran d'accueil, thème et taille du texte",
    text: "Installez Pilot-Makers sur le téléphone, choisissez le thème sombre, agrandissez le texte ou passez en contraste renforcé pour le chantier.",
    href: "/app/compte",
  },
  {
    id: "factures-structurees",
    date: "2026-10-12",
    title: "Factures Factur-X et UBL",
    text: "Chaque facture se télécharge aux formats de la facturation électronique, prêts pour votre plateforme et votre comptable.",
    href: "/aide/factures-electroniques",
    feature: "factures_structurees",
  },
  {
    id: "rapports",
    date: "2026-10-12",
    title: "Rapports et objectifs mensuels",
    text: "Signé, facturé et encaissé mois par mois, taux de signature par type de travaux, export tableur et objectifs du mois.",
    href: "/app/rapports",
  },
  {
    id: "coefficients-chutes",
    date: "2026-10-12",
    title: "Coefficients de vente et pertes de matériaux",
    text: "Le prix de vente se propose à partir du coût et de votre coefficient par famille, et les chutes s'ajoutent aux quantités mesurées.",
    href: "/app/entreprise?onglet=tarifs",
  },
  {
    id: "assistant-habitudes",
    date: "2026-10-12",
    title: "L'assistant de préparation retient vos habitudes",
    text: "Vos prix et libellés corrigés sont repris dans les propositions suivantes, et la part des lignes gardées est mesurée.",
  },
  {
    id: "relances-adaptees",
    date: "2026-10-12",
    title: "Relances adaptées à chaque client",
    text: "Le rythme et le ton des relances de factures suivent le montant et les habitudes de paiement du client.",
    href: "/app/entreprise?onglet=factures",
  },
  {
    id: "tarifs",
    date: "2026-10-12",
    title: "Taux horaires et frais de déplacement",
    text: "Un taux par qualification et un barème de déplacement selon la distance, appliqués en un clic dans le devis.",
    href: "/app/entreprise?onglet=tarifs",
  },
  {
    id: "avenants",
    date: "2026-10-12",
    title: "Avenants pour les travaux supplémentaires",
    text: "Un devis accepté se complète par un avenant numéroté, signé à part et facturé avec le chantier.",
  },
  {
    id: "situations-echeanciers",
    date: "2026-10-12",
    title: "Factures de situation et paiements en plusieurs fois",
    text: "Facturez à l'avancement du chantier et proposez un échéancier : les relances suivent chaque échéance.",
    href: "/aide/factures-de-situation",
  },
  {
    id: "demandes",
    date: "2026-10-12",
    title: "Suivi des demandes de clients",
    text: "Chaque demande reçue est suivie jusqu'au devis, avec la prochaine action à faire.",
    href: "/app/demandes",
  },
];
