/**
 * Centre d'aide : guides courts, consultables sans compte (/aide) et depuis l'application.
 * Chaque guide décrit un geste précis, étape par étape, avec les mots de l'interface.
 */

import { EDITOR_SHORTCUTS, shortcutText } from "./shortcuts";

export interface HelpArticle {
  slug: string;
  category: HelpCategory;
  title: string;
  summary: string;
  steps: string[];
  notes?: string[];
  /** Page de l'application à ouvrir pour faire le geste */
  link?: { href: string; label: string };
}

export const HELP_CATEGORIES = {
  demarrer: { label: "Bien démarrer", icon: "play" },
  devis: { label: "Devis", icon: "quote" },
  catalogue: { label: "Catalogue et assistant", icon: "box" },
  clients: { label: "Envoi et réponse du client", icon: "send" },
  factures: { label: "Factures et paiements", icon: "euro" },
  regles: { label: "Règles et mentions", icon: "shield" },
  compte: { label: "Compte et sécurité", icon: "lock" },
} as const;
export type HelpCategory = keyof typeof HELP_CATEGORIES;

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "premiers-pas",
    category: "demarrer",
    title: "Préparer son compte en quatre étapes",
    summary: "Identité de l'entreprise, assurance, catalogue, premier devis : ce qu'il faut renseigner avant d'émettre.",
    steps: [
      "Ouvrez « Mon entreprise » et complétez le nom, le SIRET et l'adresse : ces mentions sont obligatoires sur un devis.",
      "Dans l'onglet « Assurance », indiquez l'assureur, le numéro de contrat et la zone couverte si votre métier relève de la décennale.",
      "Ouvrez « Catalogue » puis « Bibliothèques » et ajoutez celle de votre métier. Remplacez ensuite les tarifs indicatifs par les vôtres.",
      "Créez votre premier devis depuis « Devis » puis « Créer un devis ».",
    ],
    notes: ["La page « Bienvenue » montre les étapes restantes et se met à jour toute seule."],
    link: { href: "/app/bienvenue", label: "Ouvrir la page Bienvenue" },
  },
  {
    slug: "creer-un-devis",
    category: "devis",
    title: "Créer et émettre un devis",
    summary: "Du devis vide jusqu'au numéro définitif et au PDF figé.",
    steps: [
      "Dans « Devis », cliquez sur « Créer un devis », choisissez le client et donnez un objet aux travaux.",
      "Ajoutez des prestations avec « Catalogue », « Ligne libre » ou l'assistant. Regroupez-les en sections si le chantier comporte plusieurs lots.",
      "Vérifiez les points signalés en bas de page : les erreurs bloquantes empêchent l'émission, les avertissements sont des rappels.",
      "Cliquez sur « Émettre », cochez la case de vérification et confirmez. Le devis reçoit son numéro et un PDF qui ne changera plus.",
    ],
    notes: [
      "Le brouillon est enregistré automatiquement à chaque modification.",
      "Les raccourcis clavier de l'éditeur sont décrits dans le guide « Raccourcis clavier de l'éditeur ».",
    ],
    link: { href: "/app/devis/nouveau", label: "Créer un devis" },
  },
  {
    slug: "raccourcis-clavier",
    category: "devis",
    title: "Raccourcis clavier de l'éditeur",
    summary: "Annuler, rétablir, enregistrer et ouvrir le catalogue sans quitter le clavier.",
    steps: EDITOR_SHORTCUTS.map((sc) => `${shortcutText(sc.keys)} : ${sc.label.charAt(0).toLowerCase()}${sc.label.slice(1)}.`),
    notes: ["Sur Mac, Cmd remplace Ctrl.", "Le bouton en forme de clavier, en haut de l'éditeur, affiche la même liste."],
  },
  {
    slug: "lignes-en-option",
    category: "devis",
    title: "Proposer des options que le client choisit",
    summary: "Chiffrer une prestation en plus, hors total, que le client coche ou non en acceptant.",
    steps: [
      "Dans l'éditeur, ouvrez le menu de la ligne et choisissez « Proposer en option » : elle reste chiffrée mais sort du total.",
      "Le PDF et la page du client affichent la ligne avec la mention « Option » et le montant des options non comprises.",
      "En acceptant en ligne, le client coche les options voulues et voit le montant final avant de valider.",
      "Les factures d'acompte et de solde reprennent exactement ce qui a été accepté, options choisies comprises.",
    ],
    notes: ["Si l'acceptation vous arrive par un autre moyen, cochez les options retenues en l'enregistrant."],
  },
  {
    slug: "modifier-un-devis-envoye",
    category: "devis",
    title: "Modifier un devis déjà envoyé",
    summary: "Une version émise n'est jamais modifiée : la correction crée une nouvelle version.",
    steps: [
      "Ouvrez le devis et cliquez sur « Modifier (nouvelle version) ».",
      "Faites vos corrections puis émettez de nouveau : le devis garde son numéro et passe en version 2.",
      "Envoyez la nouvelle version. L'ancien lien de consultation ne permet plus d'accepter.",
    ],
    notes: ["« Comparer » sur la fiche du devis montre les lignes ajoutées, retirées ou modifiées entre deux versions."],
  },
  {
    slug: "modeles-de-devis",
    category: "devis",
    title: "Réutiliser un devis comme modèle",
    summary: "Enregistrez un devis type et partez-en pour les chantiers similaires.",
    steps: [
      "Dans l'éditeur, cliquez sur « Modèle » et nommez-le.",
      "Pour un nouveau devis, choisissez ce modèle dans la liste de la page « Créer un devis ».",
      "Gérez vos modèles depuis « Modèles de devis ».",
    ],
    link: { href: "/app/modeles", label: "Voir mes modèles" },
  },
  {
    slug: "catalogue-et-bibliotheques",
    category: "catalogue",
    title: "Construire son catalogue",
    summary: "Bibliothèques par métier, import CSV, mise à jour groupée des prix.",
    steps: [
      "Ajoutez la bibliothèque de votre métier depuis « Catalogue » puis « Bibliothèques ». 15 métiers sont disponibles.",
      "Ouvrez chaque prestation pour mettre votre prix de vente et votre coût d'achat : le coût n'apparaît jamais sur le devis du client.",
      "Pour reprendre un fichier existant, utilisez « Importer » avec un fichier CSV ; un aperçu signale chaque ligne refusée.",
      "Pour une hausse générale, sélectionnez des prestations et appliquez un pourcentage.",
    ],
    link: { href: "/app/catalogue/bibliotheques", label: "Ouvrir les bibliothèques" },
  },
  {
    slug: "ouvrages",
    category: "catalogue",
    title: "Composer un ouvrage",
    summary: "Un ouvrage regroupe plusieurs prestations ; son prix suit celui de ses composants.",
    steps: [
      "Ouvrez une prestation du catalogue et ajoutez des composants dans la section « Composition ».",
      "Indiquez la quantité de chaque composant pour une unité d'ouvrage.",
      "Le prix et le coût de l'ouvrage sont recalculés à chaque changement de prix d'un composant.",
    ],
  },
  {
    slug: "assistant-de-preparation",
    category: "catalogue",
    title: "Préparer un devis avec l'assistant",
    summary: "Décrivez le chantier avec vos mots : l'assistant propose des lignes, vous validez.",
    steps: [
      "Dans l'éditeur, cliquez sur « Assistant » et décrivez les travaux, avec les surfaces et les quantités connues.",
      "L'assistant reconnaît le métier, réutilise d'abord votre catalogue et explique pourquoi chaque ligne est proposée.",
      "Décochez ce qui ne convient pas, puis ajoutez les lignes au devis.",
      "Vérifiez chaque quantité marquée « estimée » et posez au client les questions listées.",
    ],
    notes: [
      "Rien n'est ajouté sans votre clic, et le taux de TVA n'est jamais choisi à votre place.",
      "Les e-mails et numéros de téléphone sont masqués avant l'analyse.",
      "L'assistant apprend de vos devis émis : les libellés, les prix et l'ordre des lignes que vous retenez sont repris dans les propositions suivantes.",
      "Il indique aussi la part des lignes proposées que vous avez gardées telles quelles, pour juger de sa justesse.",
    ],
  },
  {
    slug: "envoyer-un-devis",
    category: "clients",
    title: "Envoyer un devis et suivre la réponse",
    summary: "E-mail avec PDF, lien sécurisé, consultation et relances.",
    steps: [
      "Sur la fiche du devis émis, cliquez sur « Envoyer par e-mail ». Le message contient un lien de consultation et le PDF.",
      "Vous voyez quand le client ouvre le devis : le statut passe à « Consulté ».",
      "Sans réponse, les relances automatiques partent selon vos réglages dans « Mon entreprise ».",
      "Vous pouvez aussi créer un lien de consultation et le transmettre par SMS.",
    ],
  },
  {
    slug: "acceptation-en-ligne",
    category: "clients",
    title: "Acceptation en ligne et preuves conservées",
    summary: "Ce que le client voit, ce qui est enregistré, et la valeur de cet accord.",
    steps: [
      "Le client ouvre le lien, lit le devis et clique sur « Accepter le devis ».",
      "Il saisit son nom, coche « Bon pour accord » et, si le devis comporte un taux réduit de TVA, l'attestation correspondante.",
      "La date, la version, l'empreinte du PDF, le nom saisi, l'adresse IP et le navigateur sont conservés.",
    ],
    notes: [
      "Cet accord est daté et tracé, mais ce n'est pas une signature électronique qualifiée.",
      "Un devis signé sur papier s'enregistre avec « Accepté » sur la fiche du devis, en indiquant la preuve dont vous disposez.",
    ],
  },
  {
    slug: "factures-de-situation",
    category: "factures",
    title: "Factures de situation selon l'avancement",
    summary: "Facturer un chantier long au fur et à mesure, en pourcentage cumulé du devis accepté.",
    steps: [
      "Sur le devis accepté, saisissez l'avancement cumulé du chantier (par exemple 40 %) et créez la situation.",
      "Chaque nouvelle situation facture seulement la différence avec la précédente : 70 % après 40 % facture 30 % du devis.",
      "Quand le chantier est terminé, créez la facture de solde : elle facture le reste jusqu'à 100 %, au centime près du devis.",
      "Pour corriger une situation, annulez-la par un avoir : elle ne compte plus dans l'avancement.",
    ],
    notes: [
      "Un même devis se facture soit par acomptes, soit par situations, pas les deux.",
      "La retenue de garantie éventuelle est déduite de chaque situation.",
    ],
  },
  {
    slug: "paiement-en-plusieurs-fois",
    category: "factures",
    title: "Paiement en plusieurs fois",
    summary: "Accorder un échéancier à un client sans modifier la facture émise.",
    steps: [
      "Ouvrez la facture et dépliez « Accorder un paiement en plusieurs fois ».",
      "Choisissez le nombre d'échéances, le rythme et la date de la première : le reste à payer est réparti en parts égales.",
      "Envoyez la facture par e-mail : le message rappelle chaque échéance et sa date.",
      "Les paiements enregistrés règlent les échéances dans l'ordre ; les relances automatiques portent sur l'échéance en retard.",
    ],
    notes: ["La facture garde sa date d'échéance d'origine : l'échéancier est un accord de règlement qui s'y ajoute."],
  },
  {
    slug: "avenant-travaux-supplementaires",
    category: "devis",
    title: "Avenant pour des travaux supplémentaires",
    summary: "Ajouter ou modifier des travaux après l'acceptation d'un devis, sans toucher au devis signé.",
    steps: [
      "Ouvrez le devis accepté et cliquez sur « Créer un avenant » : le client, le chantier et les conditions sont repris.",
      "Ajoutez les travaux supplémentaires ou modifiés, puis émettez et envoyez l'avenant comme un devis.",
      "Le PDF porte le titre « Avenant n° » et rappelle le devis initial ; le client l'accepte en ligne comme un devis.",
      "Une fois accepté, l'avenant se facture à part ; la fiche du devis initial affiche le total avec avenants acceptés.",
    ],
    notes: ["Les avenants sont numérotés dans l'ordre pour chaque devis initial."],
  },
  {
    slug: "taux-horaires-et-deplacements",
    category: "devis",
    title: "Taux horaires, coefficients, chutes et déplacements",
    summary: "Chiffrer la main-d'œuvre et les déplacements d'un clic, avec vos propres tarifs.",
    steps: [
      "Dans Entreprise, onglet Tarifs, indiquez le prix de l'heure de chaque qualification (apprenti, ouvrier, chef d'équipe) et, si vous le souhaitez, son coût interne.",
      "Renseignez le barème des déplacements : forfait par déplacement, prix du kilomètre et rayon sans frais kilométriques.",
      "Dans l'éditeur, une ligne de main-d'œuvre propose la liste des qualifications : le prix de l'heure et le coût interne se remplissent.",
      "Le bouton « Déplacement » d'une section calcule la ligne à partir de la distance du chantier et du nombre de déplacements.",
      "Avec un coefficient de vente par famille, une ligne dont vous saisissez le coût d'achat propose le prix de vente correspondant.",
      "Un matériau du catalogue peut porter un taux de pertes et chutes : sur le devis, un clic passe de la quantité mesurée à la quantité à fournir.",
    ],
    notes: [
      "Les kilomètres comptés sont ceux de l'aller-retour au-delà du rayon sans frais.",
      "Pensez à décrire vos modalités dans l'onglet Devis : elles sont imprimées sur le devis.",
    ],
  },
  {
    slug: "rapports-et-objectifs",
    category: "devis",
    title: "Rapports et objectifs mensuels",
    summary: "Suivre le signé, le facturé et l'encaissé, le taux de signature, les délais et le panier moyen.",
    steps: [
      "Ouvrez « Rapports » : les 12 derniers mois sont détaillés mois par mois.",
      "Fixez vos objectifs du mois (montant signé, devis envoyés) : la progression s'affiche en haut de la page.",
      "Comparez le taux de signature par type de travaux et par auteur du devis.",
      "Exportez le rapport au format tableur, ou imprimez-le et enregistrez-le en PDF.",
    ],
    notes: ["Un devis signé n'est pas encore encaissé : les trois montants sont présentés séparément."],
  },
  {
    slug: "factures-electroniques",
    category: "factures",
    title: "Factures aux formats électroniques (Factur-X, UBL)",
    summary: "Télécharger une facture lisible par les logiciels comptables et les plateformes de facturation électronique.",
    steps: [
      "Ouvrez une facture ou un avoir émis.",
      "Dans « Formats structurés », choisissez Factur-X (le PDF habituel avec ses données jointes), XML CII ou XML UBL.",
      "Déposez le fichier sur votre plateforme de facturation électronique ou transmettez-le à votre comptable.",
    ],
    notes: [
      "Les fichiers suivent la norme européenne EN 16931 et reprennent exactement les montants du PDF archivé, qui reste inchangé.",
      "Acompte, avoir, autoliquidation et franchise de TVA sont codés selon la norme. La retenue de garantie figure en note.",
      "La conformité définitive se vérifie avec la plateforme de facturation électronique que vous choisirez.",
    ],
  },
  {
    slug: "factures-acompte-et-solde",
    category: "factures",
    title: "Facturer un acompte puis le solde",
    summary: "Depuis un devis accepté, sans ressaisie.",
    steps: [
      "Ouvrez le devis accepté. Dans le panneau « Facturation », indiquez le pourcentage et cliquez sur « Facturer l'acompte ».",
      "À la fin du chantier, cliquez sur « Facturer le solde » : les acomptes déjà facturés sont déduits automatiquement.",
      "Envoyez chaque facture par e-mail depuis sa fiche.",
    ],
    notes: ["Une facture émise ne se modifie jamais. Pour la corriger, émettez un avoir total ou partiel."],
    link: { href: "/app/factures", label: "Voir les factures" },
  },
  {
    slug: "encaissements-et-relances",
    category: "factures",
    title: "Enregistrer un paiement et relancer",
    summary: "Suivre ce qui reste à encaisser.",
    steps: [
      "Sur la fiche de la facture, saisissez le montant, la date et le moyen de paiement, puis « Enregistrer le paiement ».",
      "Un paiement partiel laisse la facture « Partiellement payée » avec le reste dû.",
      "Les relances des factures échues se règlent dans « Mon entreprise », onglet « Factures ».",
      "Avec « Adapter le rythme et le ton à chaque client », un bon payeur est relancé quelques jours plus tard, un client souvent en retard ou un gros montant plus tôt, et le ton monte d'une relance à l'autre.",
    ],
    notes: ["L'habitude de paiement de chaque client figure sur sa fiche, calculée à partir de ses factures déjà soldées."],
  },
  {
    slug: "export-comptable",
    category: "factures",
    title: "Transmettre les écritures au comptable (FEC)",
    summary: "Un fichier des écritures comptables, prêt à importer.",
    steps: [
      "Ouvrez « Factures » et choisissez la période dans le bloc « Export comptable ».",
      "Téléchargez le fichier et transmettez-le à votre expert-comptable.",
    ],
    notes: ["Seuls les propriétaires et administrateurs du compte peuvent exporter."],
  },
  {
    slug: "tva-reduite",
    category: "regles",
    title: "Taux réduits de TVA et attestation du client",
    summary: "10 % et 5,5 % pour les travaux dans un logement de plus de deux ans, sous conditions.",
    steps: [
      "Choisissez le taux sur chaque ligne : le logiciel le propose mais ne le décide jamais.",
      "Quand un taux réduit est présent, le PDF comporte l'attestation du client et l'acceptation en ligne demande de la cocher.",
      "Conservez le devis accepté : il porte la preuve de l'attestation.",
    ],
    notes: ["Les conditions exactes dépendent du logement et de la nature des travaux : faites-les valider par votre conseil en cas de doute."],
  },
  {
    slug: "sous-traitance-et-retenue-de-garantie",
    category: "regles",
    title: "Sous-traitance : autoliquidation et retenue de garantie",
    summary: "Facturer hors TVA une entreprise du bâtiment qui vous sous-traite des travaux, et appliquer la retenue de 5 %.",
    steps: [
      "Choisissez un client professionnel : les options de sous-traitance apparaissent dans les conditions du devis.",
      "Cochez « Travaux en sous-traitance » : le devis et ses factures sont établis sans TVA, avec la mention de l'article 283-2 nonies du CGI.",
      "Si le donneur d'ordre applique une retenue de garantie, choisissez « 5 % du TTC » : elle est annoncée sur le devis et déduite de la facture de solde.",
    ],
    notes: [
      "Le numéro de TVA de l'entreprise cliente doit figurer dans sa fiche.",
      "L'autoliquidation n'est pas possible en franchise en base de TVA ni pour un client particulier.",
    ],
  },
  {
    slug: "droit-de-retractation",
    category: "regles",
    title: "Délai de rétractation de 14 jours",
    summary: "Pour un devis signé chez un particulier, hors de vos locaux.",
    steps: [
      "Dans l'éditeur, le champ « Lieu de signature du contrat » est réglé sur « Automatique » : un client particulier bénéficie du délai.",
      "Le PDF comporte alors la mention du délai et un formulaire de rétractation détachable.",
      "Aucun acompte ne peut être encaissé avant sept jours : l'éditeur vous le rappelle si vous en demandez un.",
      "Le client peut demander en ligne que les travaux commencent avant la fin du délai.",
    ],
  },
  {
    slug: "mentions-obligatoires",
    category: "regles",
    title: "Les contrôles avant émission",
    summary: "Ce que le logiciel vérifie, et ce qu'il ne peut pas vérifier pour vous.",
    steps: [
      "Identité et adresse de l'entreprise, client, lieu des travaux, objet, validité et conditions de paiement sont bloquants.",
      "Assurance, taux horaire, frais de déplacement, estimations restantes et taux réduits font l'objet d'avertissements.",
    ],
    notes: ["Ces contrôles aident mais ne remplacent pas un avis juridique adapté à votre métier."],
  },
  {
    slug: "double-authentification",
    category: "compte",
    title: "Activer la double authentification",
    summary: "Un code à six chiffres en plus du mot de passe.",
    steps: [
      "Ouvrez « Mon compte » puis la section « Double authentification ».",
      "Scannez le code avec une application d'authentification, puis saisissez le code affiché pour confirmer.",
      "Conservez les codes de secours dans un endroit sûr : chacun permet une connexion si vous perdez votre téléphone.",
    ],
    link: { href: "/app/compte", label: "Ouvrir mon compte" },
  },
  {
    slug: "equipe-et-roles",
    category: "compte",
    title: "Inviter un collaborateur",
    summary: "Propriétaire, administrateur ou membre : qui peut faire quoi.",
    steps: [
      "Ouvrez « Équipe » et invitez la personne par e-mail en choisissant son rôle.",
      "Un membre prépare et envoie des devis ; un administrateur gère aussi l'entreprise, le catalogue et les exports.",
    ],
  },
  {
    slug: "exporter-ses-donnees",
    category: "compte",
    title: "Exporter ou supprimer ses données",
    summary: "Vos données vous appartiennent, abonnement actif ou non.",
    steps: [
      "Ouvrez « Mon compte » et cliquez sur « Exporter toutes mes données » : vous obtenez un fichier complet.",
      "La suppression du compte se demande depuis la même page ; elle devient définitive 30 jours après votre confirmation par e-mail.",
    ],
  },
];

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Recherche simple : tous les mots saisis doivent figurer dans le titre, le résumé ou les étapes. */
export function searchHelp(query: string): HelpArticle[] {
  const words = normalize(query)
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((a) => {
    const text = normalize([a.title, a.summary, ...a.steps, ...(a.notes ?? [])].join(" "));
    return words.every((w) => text.includes(w));
  });
}

export function helpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
