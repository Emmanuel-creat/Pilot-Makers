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
      "S'il manque une information (surface, hauteur sous plafond, type de support, volume de gravats, accès), répondez dans « Informations manquantes » puis cliquez sur « Relancer avec ces réponses » : vos réponses s'ajoutent à la description et les quantités se remplissent.",
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
    slug: "revision-de-prix",
    category: "factures",
    title: "Prix révisables selon un index BT",
    summary: "Répercuter l'évolution du coût de la construction sur un chantier long.",
    steps: [
      "Dans Mon entreprise, onglet Tarifs, saisissez les valeurs des index BT publiées par l'INSEE (mois de référence et mois facturés).",
      "Dans le devis, choisissez « Prix : révisables » avec l'index du métier, le mois de référence et la part fixe (15 % par défaut). La formule est imprimée sur le devis.",
      "Au moment de facturer une situation ou le solde, indiquez le mois de l'index : la révision s'ajoute en ligne séparée, par taux de TVA.",
    ],
    notes: [
      "Formule : P = P0 x (fixe + (1 - fixe) x In / I0), coefficient arrondi à 4 décimales. Une baisse de l'index réduit la facture.",
      "Les acomptes restent aux prix du devis. Laissez le mois vide pour facturer sans révision.",
    ],
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
    slug: "suivre-un-chantier",
    category: "devis",
    title: "Suivre un chantier et son avancement",
    summary: "Du devis accepté aux tâches, avec l'avancement à reporter sur les situations.",
    steps: [
      "Ouvrez le devis accepté et cliquez sur « Créer le chantier » : chaque ligne devient une tâche, rangée par lot.",
      "Sur la fiche, notez l'adresse, les consignes d'accès, les codes et les contacts sur place. Les codes sont chiffrés.",
      "Au fil des travaux, touchez le pourcentage atteint pour chaque tâche : l'avancement par lot et l'avancement global se mettent à jour.",
      "Pour facturer, reportez l'avancement global sur une facture de situation depuis le devis.",
    ],
    notes: ["L'avancement est pondéré par le montant de chaque ligne : une grosse tâche compte plus qu'une petite."],
    link: { href: "/app/chantiers", label: "Voir les chantiers" },
  },
  {
    slug: "reception-des-travaux",
    category: "devis",
    title: "Journal de chantier, réception et réserves",
    summary: "Photos datées, procès-verbal signé sur place et levée des réserves.",
    steps: [
      "Sur la fiche du chantier, ajoutez des photos et des notes au journal : la date de prise de vue et la position sont enregistrées.",
      "À la fin des travaux, remplissez la réception avec le client : sans réserve, avec réserves (défaut, localisation, délai) ou refus motivé.",
      "Le client puis l'entreprise signent au doigt sur l'écran : le procès-verbal est figé en PDF.",
      "Levez chaque réserve une fois les travaux faits : le procès-verbal de levée se télécharge quand toutes sont levées.",
    ],
    notes: [
      "La réception fait courir les garanties de parfait achèvement, biennale et décennale, et rend exigible le solde.",
      "Les photos sont réduites avant l'envoi pour passer même avec un réseau faible.",
    ],
  },
  {
    slug: "planning",
    category: "devis",
    title: "Planifier les équipes et les véhicules",
    summary: "Vue semaine ou mois, glisser-déposer et repérage des conflits.",
    steps: [
      "Ouvrez « Planning » et ajoutez vos véhicules si besoin. Les membres de l'équipe apparaissent d'office.",
      "Affectez une personne ou un véhicule à un chantier sur une période : les dates du chantier se mettent à jour.",
      "Glissez une affectation vers une autre case pour changer de jour ou de personne ; la durée est conservée. Au clavier, utilisez la liste sous la grille.",
      "Une case rouge signale un conflit : la même personne ou le même véhicule est prévu sur deux chantiers le même jour.",
    ],
    notes: ["Un conflit est signalé mais pas bloqué : vous restez libre d'organiser vos journées."],
    link: { href: "/app/planning", label: "Ouvrir le planning" },
  },
  {
    slug: "exporter-toutes-ses-donnees",
    category: "compte",
    title: "Exporter toutes ses données",
    summary: "Une archive ZIP en formats ouverts, lisible sans Pilot-Makers.",
    steps: [
      "Ouvrez « Mon compte », section « Mes données », et cliquez sur « Tout télécharger (ZIP) ».",
      "L'archive contient vos tableaux CSV (clients, catalogue, devis, factures, paiements, chantiers, planning) à ouvrir dans Excel ou LibreOffice.",
      "Elle contient aussi chaque devis, facture et procès-verbal émis en PDF, les photos de chantier et un fichier JSON complet.",
    ],
    notes: ["Réservé au gérant et aux administrateurs. Les mots de passe et secrets techniques ne sont jamais exportés."],
    link: { href: "/app/compte", label: "Ouvrir Mon compte" },
  },
  {
    slug: "importer-depuis-un-autre-logiciel",
    category: "demarrer",
    title: "Reprendre ses clients et son catalogue depuis un autre logiciel",
    summary: "Fichiers CSV, Excel ou LibreOffice, colonnes reconnues automatiquement.",
    steps: [
      "Dans votre ancien logiciel ou votre tableur, exportez la liste des clients et celle des articles ou prestations (CSV, .xlsx ou .ods).",
      "Ouvrez « Clients » puis « Importer », ou « Catalogue » puis « Importer », et choisissez le fichier.",
      "Les colonnes sont reconnues d'après leur titre (« Raison sociale », « Désignation », « Prix unitaire HT »...). Vérifiez l'aperçu ligne par ligne.",
      "Confirmez : seules les lignes valides sont enregistrées, les doublons probables peuvent être ignorés.",
    ],
    notes: [
      "Les codes postaux et numéros de téléphone qui ont perdu leur zéro initial dans Excel sont corrigés.",
      "Sans colonne de TVA, le taux de 20 % est appliqué et signalé dans l'aperçu. L'ancien format Excel .xls doit d'abord être enregistré en .xlsx.",
    ],
    link: { href: "/app/clients/import", label: "Importer des clients" },
  },
  {
    slug: "api-publique",
    category: "compte",
    title: "Relier Pilot-Makers à d'autres logiciels avec l'API",
    summary: "Clés d'accès, droits en lecture ou en écriture, 120 requêtes par minute.",
    steps: [
      "Ouvrez « Entreprise », onglet « API », donnez un nom à la clé et choisissez ses droits : lecture, ou lecture et écriture.",
      "Copiez la clé affichée : elle ne sera plus montrée. Votre outil l'envoie dans l'en-tête « Authorization: Bearer ».",
      "Lisez vos clients, devis, factures (avec leurs PDF), catalogue et chantiers ; créez des clients et des prestations avec une clé en écriture.",
      "Révoquez une clé qui ne sert plus : elle cesse de fonctionner immédiatement.",
    ],
    notes: [
      "Une clé agit au nom de l'administrateur qui l'a créée et cesse de fonctionner s'il quitte l'entreprise ou n'est plus administrateur.",
      "La description complète, au format OpenAPI, est publiée sur /api/v1/openapi.json.",
    ],
    link: { href: "/app/entreprise?onglet=api", label: "Ouvrir l'onglet API" },
  },
  {
    slug: "automatiser-zapier-make-n8n",
    category: "compte",
    title: "Automatiser avec Zapier, Make ou n8n",
    summary: "Déclencher un scénario quand un devis est signé, une facture payée ou un client créé.",
    steps: [
      "Créez une clé « Lecture et écriture » dans Entreprise, onglet API, et collez-la dans votre outil (en-tête « Authorization: Bearer »).",
      "Pour déclencher un scénario, l'outil s'abonne à un événement avec POST /api/v1/webhooks (adresse de réception et événement). Pilot-Makers lui envoie ensuite chaque événement, signé.",
      "Pour agir dans Pilot-Makers (créer un client, ajouter une prestation, lire un devis ou télécharger un PDF), utilisez les adresses /api/v1 avec un module HTTP.",
      "Quand vous arrêtez le scénario, l'outil se désabonne. Révoquer la clé retire aussi tous ses abonnements.",
    ],
    notes: ["Des exemples de données pour préparer un scénario sont disponibles sur /api/v1/webhooks/samples."],
    link: { href: "/app/entreprise?onglet=api", label: "Ouvrir l'onglet API" },
  },
  {
    slug: "pointer-ses-heures",
    category: "demarrer",
    title: "Pointer ses heures et préparer la paie",
    summary: "Chronomètre sur le téléphone, validation par l'encadrement, export pour le cabinet de paie.",
    steps: [
      "Sur le chantier, ouvrez « Pointage », choisissez le chantier et touchez « Commencer ». Touchez « Terminer » en partant : la durée est calculée.",
      "Un oubli ? Saisissez les heures après coup : date, durée (7:30 ou 7,5) et chantier.",
      "Le gérant ou un administrateur ouvre l'onglet « Équipe » du pointage, coche les heures et les valide ou les refuse avec une raison.",
      "En fin de mois, téléchargez le récapitulatif : heures normales, supplémentaires à 25 % et à 50 % par salarié, à transmettre au cabinet de paie.",
    ],
    notes: [
      "Une heure validée n'est plus modifiable par la personne. Les heures supplémentaires sont calculées par semaine civile au-delà de 35 heures.",
      "Renseignez la qualification de chaque membre dans « Équipe » : le coût des heures apparaît alors sur chaque chantier.",
    ],
    link: { href: "/app/pointage", label: "Ouvrir le pointage" },
  },
  {
    slug: "suivre-les-couts-d-un-chantier",
    category: "devis",
    title: "Suivre les coûts et la marge réelle d'un chantier",
    summary: "Achats et heures comparés au devis, alerte avant le dépassement.",
    steps: [
      "Ouvrez le chantier : la section « Coûts et marge » compare le coût prévu au devis et le coût réel.",
      "Ajoutez chaque facture fournisseur, sous-traitance ou location, en l'affectant si possible à la ligne du devis concernée.",
      "Les heures pointées sont valorisées au coût de la qualification de chaque personne (onglet Tarifs et page Équipe).",
      "Une alerte apparaît sur le chantier et le tableau de bord quand le coût réel atteint le seuil choisi (90 % par défaut), puis quand il dépasse le prévu.",
    ],
    notes: ["Les coûts prévus viennent des coûts d'achat saisis sur les lignes du devis. Un avoir fournisseur se saisit en montant négatif."],
    link: { href: "/app/chantiers", label: "Voir les chantiers" },
  },
  {
    slug: "commander-aux-fournisseurs",
    category: "devis",
    title: "Commander aux fournisseurs et rapprocher leurs factures",
    summary: "Bons de commande préparés depuis le devis signé, réception des livraisons, contrôle de la facture.",
    steps: [
      "Ouvrez le chantier et touchez « Préparer les commandes depuis le devis » : une commande est créée par fournisseur du catalogue, avec les fournitures et la sous-traitance du devis.",
      "Ajustez les quantités et les prix, précisez le fournisseur et la date de livraison, puis téléchargez le bon de commande en PDF pour l'envoyer.",
      "Marquez la commande comme envoyée. À chaque livraison, saisissez la quantité reçue au total : la commande passe en « Reçue en partie » puis « Reçue ».",
      "À réception de la facture, saisissez son montant HT : il est comparé à la marchandise reçue et ajouté aux achats du chantier.",
    ],
    notes: [
      "Une ligne déjà commandée n'est pas reprise une seconde fois. Une facture est jugée conforme à 1 euro ou 1 % près.",
      "Le fournisseur de chaque article se renseigne dans le catalogue.",
    ],
    link: { href: "/app/chantiers", label: "Voir les chantiers" },
  },
  {
    slug: "planning-dans-mon-agenda",
    category: "demarrer",
    title: "Voir le planning dans Google Agenda, Outlook ou l'iPhone",
    summary: "Un lien d'abonnement personnel : l'agenda du téléphone se met à jour tout seul.",
    steps: [
      "Ouvrez « Planning » et, en bas de page, touchez « Créer le lien d'abonnement ».",
      "Copiez le lien affiché, puis ajoutez-le dans votre agenda : « À partir de l'URL » dans Google Agenda, « S'abonner à partir du web » dans Outlook.",
      "Sur iPhone ou Mac, touchez « Ouvrir dans l'agenda de l'appareil » : l'abonnement s'ajoute directement.",
      "Chaque compagnon peut créer son propre lien : il n'y voit que les chantiers où il est affecté.",
    ],
    notes: [
      "Pour l'encadrement, l'agenda peut aussi montrer les échéances de factures, la fin de validité des devis envoyés, les réserves à lever et les livraisons attendues.",
      "Le lien donne accès à vos chantiers sans mot de passe : ne le partagez pas, et remplacez-le s'il a circulé. Il cesse de fonctionner si la personne quitte l'entreprise.",
    ],
    link: { href: "/app/planning", label: "Ouvrir le planning" },
  },
  {
    slug: "suivre-ses-sous-traitants",
    category: "clients",
    title: "Suivre les documents de ses sous-traitants",
    summary: "Attestation de vigilance URSSAF et assurance décennale à jour, avec alerte et relance avant expiration.",
    steps: [
      "Ouvrez « Sous-traitants » et créez la fiche : raison sociale, SIRET, interlocuteur et e-mail.",
      "Ajoutez l'attestation de vigilance URSSAF et l'attestation d'assurance décennale, en PDF ou en photo, avec leur date de fin de validité.",
      "Sur chaque chantier, indiquez les sous-traitants et le montant confié : au-delà de 5 000 euros HT, l'obligation de vigilance s'affiche si un document manque.",
      "Touchez « Demander les documents à jour » pour envoyer la demande par e-mail, ou activez la relance automatique sur la fiche.",
    ],
    notes: [
      "Sans date indiquée, l'attestation URSSAF est comptée valable six mois. Le tableau de bord signale les documents manquants, expirés ou qui expirent dans les 30 jours.",
      "Le donneur d'ordre qui ne vérifie pas ces documents peut être tenu solidairement des cotisations impayées du sous-traitant.",
    ],
    link: { href: "/app/sous-traitants", label: "Ouvrir les sous-traitants" },
  },
  {
    slug: "notes-de-frais",
    category: "demarrer",
    title: "Envoyer et valider les notes de frais",
    summary: "Le ticket photographié sur le téléphone, validé par l'encadrement, remboursé et exporté pour la comptabilité.",
    steps: [
      "Ouvrez « Notes de frais », photographiez le ticket et indiquez le montant TTC, la TVA si elle figure sur le ticket et la catégorie.",
      "Rattachez la dépense au chantier concerné et précisez si vous l'avez avancée ou payée avec la carte de l'entreprise.",
      "Le gérant ou un administrateur ouvre l'onglet « Équipe », coche les notes et les valide, ou les refuse avec une raison.",
      "Une fois le virement fait, il coche les notes et touche « Remboursé ». L'export CSV du mois part à la comptabilité.",
    ],
    notes: [
      "Une note validée et rattachée à un chantier s'ajoute à ses achats, pour son montant hors taxes : la marge réelle en tient compte.",
      "Une note refusée peut être supprimée puis renvoyée corrigée. Une note remboursée se conserve.",
    ],
    link: { href: "/app/frais", label: "Ouvrir les notes de frais" },
  },
  {
    slug: "droits-par-fonction",
    category: "compte",
    title: "Donner à chacun les droits de sa fonction",
    summary: "Gérant, conducteur de travaux, secrétariat, ouvrier : chacun voit ce dont il a besoin.",
    steps: [
      "Ouvrez « Équipe » et choisissez la fonction de chaque personne : elle est enregistrée aussitôt.",
      "Conducteur de travaux : devis, chantiers, planning, coûts, commandes, sous-traitants, validation des heures et des frais, sans factures ni réglages.",
      "Secrétariat : devis, clients, factures, paiements, relances, heures et frais pour la paie, sans coûts ni marges.",
      "Ouvrier ou compagnon : ses chantiers, le journal, son pointage et ses notes de frais.",
    ],
    notes: [
      "Le titulaire du compte garde toujours tous les droits. Sans fonction précisée, les droits du rôle s'appliquent comme avant.",
      "Lors d'une invitation, la fonction choisie fixe aussi le rôle : administrateur pour le conducteur et le secrétariat, membre pour l'ouvrier.",
    ],
    link: { href: "/app/equipe", label: "Ouvrir l'équipe" },
  },
  {
    slug: "espace-client-et-echanges",
    category: "devis",
    title: "Échanger avec vos clients et leur ouvrir un espace",
    summary: "Questions et demandes de modification rattachées au devis, et un espace où le client retrouve tous ses documents.",
    steps: [
      "Sur la page du devis qu'il a reçu, votre client peut vous écrire ou demander la modification d'une ligne précise. Vous recevez un e-mail.",
      "Le tableau de bord signale les nouveaux messages. Sur le devis, la section « Échanges avec le client » affiche le fil : répondez, le client reçoit votre réponse par e-mail.",
      "Une demande de modification reste ouverte tant que vous ne l'avez pas marquée comme traitée, par exemple après l'envoi d'une nouvelle version du devis.",
      "Sur la fiche client, « Espace client » crée un lien personnel valable plusieurs mois : envoyez-le par e-mail ou copiez-le. Le client y retrouve ses devis, factures, procès-verbaux de réception et vos échanges.",
    ],
    notes: [
      "Depuis son espace, le client peut répondre à un devis en attente : un lien de réponse neuf est créé à chaque fois.",
      "Vous pouvez désactiver tous les liens d'espace d'un client en un geste. Les échanges sont inclus dans l'export complet de vos données.",
    ],
    link: { href: "/app/clients", label: "Ouvrir les clients" },
  },
  {
    slug: "devis-sous-traitants",
    category: "devis",
    title: "Demander un prix à un sous-traitant et l'intégrer au devis",
    summary: "Le sous-traitant répond en ligne, son prix devient une ligne de votre devis avec votre marge.",
    steps: [
      "Dans le devis en préparation, section « Prix des sous-traitants », choisissez le sous-traitant et décrivez les travaux demandés.",
      "Il reçoit un lien par e-mail et indique son montant hors taxes, son délai et joint son devis, sans créer de compte. Vous êtes prévenu dès sa réponse.",
      "Un prix reçu par téléphone se saisit aussi à la main. Comparez les réponses, écartez celles que vous ne retenez pas.",
      "Touchez « Intégrer au devis » avec votre marge : une ligne de sous-traitance au forfait s'ajoute, avec le coût du sous-traitant en coût de revient.",
    ],
    notes: [
      "Le sous-traitant peut corriger son prix tant que vous n'avez pas décidé. Une fois le prix retenu ou écarté, le lien se ferme.",
      "Les demandes se retrouvent aussi sur la fiche du sous-traitant, et dans l'export complet de vos données.",
    ],
    link: { href: "/app/sous-traitants", label: "Ouvrir les sous-traitants" },
  },
  {
    slug: "trajets-du-jour",
    category: "devis",
    title: "Préparer les trajets de la journée",
    summary: "Ordre conseillé des chantiers, kilomètres et temps de route de chacun, et l'itinéraire dans votre application de navigation.",
    steps: [
      "Sur la fiche du chantier, touchez « Localiser l'adresse », ou « Je suis sur le chantier » pour enregistrer la position exacte avec le téléphone.",
      "Dans le planning, ouvrez « Trajets » : chaque personne affectée ce jour-là a sa tournée, au départ et au retour du dépôt.",
      "L'ordre proposé va toujours au chantier le plus proche. Les distances et durées sont des estimations, détours routiers compris.",
      "Touchez « Ouvrir l'itinéraire » pour lancer la navigation avec toutes les étapes.",
    ],
    notes: [
      "« Localiser les adresses manquantes » traite d'un coup les chantiers du jour. Une adresse introuvable se règle en relevant la position sur place.",
      "Si l'adresse du chantier change, sa position tirée de l'ancienne adresse est effacée ; une position relevée sur place est conservée.",
      "Un compagnon ne voit que sa propre tournée.",
    ],
    link: { href: "/app/planning/trajets", label: "Ouvrir les trajets du jour" },
  },
  {
    slug: "metres",
    category: "devis",
    title: "Calculer une quantité à partir des cotes",
    summary: "Surfaces, murs, volumes, linéaires et plinthes, portes et fenêtres déduites, reportés sur la ligne du devis.",
    steps: [
      "Sur une ligne du devis, touchez « Métré ». Le type est proposé d'après la désignation : murs pour une peinture, volume pour du béton.",
      "Saisissez les cotes en mètres, une rangée par pièce ou par zone, avec le nombre de fois qu'elle se répète.",
      "Pour les murs et les sols, ajoutez les portes et fenêtres à déduire avec leur largeur et leur hauteur.",
      "Le total s'affiche avec le détail du calcul. « Reporter » remplit la quantité et l'unité de la ligne.",
    ],
    notes: [
      "Le métré reste attaché à la ligne : rouvrez-le pour corriger une cote, la quantité suit. Il n'est jamais imprimé sur le devis.",
      "Les chutes conseillées par le catalogue s'ajoutent ensuite à la quantité mesurée, comme avant.",
    ],
    link: { href: "/app/devis/nouveau", label: "Créer un devis" },
  },
  {
    slug: "mise-en-page-du-devis",
    category: "devis",
    title: "Choisir la mise en page du devis",
    summary: "Détail continu, récapitulatif des lots en première page, ou un lot par page pour les gros chantiers.",
    steps: [
      "Dans le devis, ouvrez les informations du devis et choisissez « Mise en page ».",
      "« Détaillée » enchaîne toutes les lignes avec un sous-total par section.",
      "« Récapitulatif en tête » montre en première page le montant de chaque lot, puis tout le détail : pratique pour un client qui compare.",
      "« Un lot par page » sépare chaque section, puis récapitule les lots avant les totaux : idéal pour un maître d'œuvre ou un dossier par corps d'état.",
    ],
    notes: [
      "Toutes les mises en page gardent le détail des prestations en quantité et en prix, comme l'exige la réglementation.",
      "La mise en page ne s'applique qu'à partir de deux sections. Les factures gardent toujours le détail continu.",
    ],
    link: { href: "/app/devis/nouveau", label: "Créer un devis" },
  },
  {
    slug: "devis-traduit",
    category: "devis",
    title: "Remettre un devis traduit à un client étranger",
    summary: "Copie du devis en anglais, espagnol, portugais ou allemand, en plus de la version française qui fait foi.",
    steps: [
      "Sur un devis émis, sous chaque version, choisissez la langue de la copie traduite : English, Español, Português ou Deutsch.",
      "Votre client trouve aussi ces copies sur la page de son devis, sous le bouton de téléchargement.",
      "Titres, colonnes, totaux, TVA et zone d'acceptation sont traduits. Vos désignations et vos conditions restent telles que vous les avez écrites.",
    ],
    notes: [
      "La copie indique en tête que seule la version française émise fait foi. Les mentions légales y restent en français, avec leur titre traduit.",
      "Le client accepte toujours le devis français, en ligne ou sur papier.",
    ],
    link: { href: "/app/devis", label: "Ouvrir les devis" },
  },
  {
    slug: "signature-sur-place",
    category: "devis",
    title: "Faire signer le devis sur place, sur votre écran",
    summary: "Le client signe au doigt sur votre tablette ou votre téléphone, chez lui ou au bureau, et reçoit son exemplaire signé par e-mail.",
    steps: [
      "Ouvrez le devis émis puis, dans « Réponse du client », touchez « Faire signer sur place ».",
      "Tendez l'écran au client : il coche les options retenues, vérifie son nom, coche « Bon pour accord » et, si besoin, l'attestation de TVA réduite.",
      "Il signe dans le cadre au doigt ou au stylet, puis valide. Le devis passe en accepté.",
      "S'il a une adresse e-mail, il reçoit aussitôt le lien vers son exemplaire signé. Sinon, remettez-lui l'exemplaire accepté depuis la page du devis.",
    ],
    notes: [
      "La signature dessinée est reportée sur l'exemplaire accepté, avec la date, l'heure et l'empreinte du devis. Elle est conservée avec sa propre empreinte dans l'historique.",
      "Seule la dernière version émise, encore valable, peut être signée. Pour un particulier, le délai de rétractation de 14 jours s'applique comme pour une acceptation en ligne.",
    ],
    link: { href: "/app/devis", label: "Ouvrir les devis" },
  },
  {
    slug: "lots-par-batiment",
    category: "devis",
    title: "Regrouper les lots par bâtiment, étage ou zone",
    summary: "Pour un chantier sur plusieurs bâtiments ou niveaux : chaque ensemble de lots a son titre et son sous-total sur le devis.",
    steps: [
      "Dans le devis, créez au moins deux sections (lots).",
      "Au-dessus du titre de chaque lot, indiquez son regroupement : « Bâtiment A », « Rez-de-chaussée », « Logement 12 ». Les noms déjà saisis sont proposés.",
      "Les lots qui se suivent avec le même regroupement sont additionnés : le sous-total apparaît sous le dernier d'entre eux.",
      "Un lot ajouté reprend le regroupement du lot précédent ; videz le champ pour un lot commun, comme l'installation de chantier.",
    ],
    notes: [
      "Le PDF affiche le titre du regroupement, le sous-total de chaque lot puis celui du regroupement. Le récapitulatif en tête ou en fin de devis présente les regroupements avec leurs lots.",
      "Pour qu'un bâtiment n'ait qu'un sous-total, placez ses lots les uns à la suite des autres avec les flèches de chaque section.",
    ],
    link: { href: "/app/devis", label: "Ouvrir les devis" },
  },
  {
    slug: "page-vitrine",
    category: "compte",
    title: "Publier votre page vitrine et vos réalisations",
    summary: "Une page publique générée depuis votre profil : présentation, coordonnées, assurance, photos de chantiers et demande de devis.",
    steps: [
      "Dans Entreprise, onglet Vitrine, cochez « Publier la page vitrine », choisissez son adresse et rédigez une courte présentation.",
      "Choisissez d'afficher ou non votre téléphone et votre e-mail, puis enregistrez. Le lien « Voir la page » ouvre la vitrine telle que vos clients la verront.",
      "Pour ajouter une réalisation, ouvrez un chantier : sous une photo du journal, cliquez sur « Publier dans la vitrine », ajoutez une légende et confirmez l'accord du client.",
      "Les demandes déposées sur la vitrine arrivent dans vos demandes entrantes, et vous êtes prévenu par e-mail.",
    ],
    notes: [
      "Les photos sont publiées sans position GPS ni informations de l'appareil. Le nom du client et l'adresse du chantier ne sont jamais affichés, seulement la ville si vous le souhaitez.",
      "Ne publiez que des photos sans personne reconnaissable ni numéro de rue visible. Vous pouvez retirer une photo à tout moment depuis l'onglet Vitrine.",
      "La vitrine s'ouvre une fois le nom commercial et le SIRET renseignés.",
    ],
    link: { href: "/app/entreprise?onglet=vitrine", label: "Ouvrir la vitrine" },
  },
  {
    slug: "tarifs-fournisseurs",
    category: "catalogue",
    title: "Mettre à jour vos prix d'achat avec le fichier de votre négoce",
    summary: "Importez le fichier de prix d'un fournisseur : vos coûts d'achat se mettent à jour et une alerte signale les marges trop basses.",
    steps: [
      "Sur chaque article acheté, indiquez le fournisseur et sa référence chez lui (fiche de l'article, informations internes).",
      "Demandez à votre négoce son fichier de prix (CSV ou Excel, par exemple au format FAB-DIS), puis ouvrez Catalogue, Tarifs fournisseurs.",
      "Choisissez le fournisseur, le seuil de marge en dessous duquel vous voulez être alerté, et le fichier. « Voir les changements » montre chaque prix d'achat modifié et la marge qui en résulte.",
      "Confirmez avec « Appliquer les nouveaux prix d'achat ». Les articles passés sous le seuil apparaissent en tête du catalogue jusqu'à ce que vous cliquiez sur « Marge vue ».",
    ],
    notes: [
      "Vos prix de vente ne changent jamais automatiquement : vous décidez de les revoir.",
      "Le prix net est repris tel quel, ou calculé depuis le prix public et la remise du fichier. Chaque changement reste dans l'historique des prix de l'article, et les ouvrages qui contiennent l'article suivent son nouveau coût.",
      "Réservé aux personnes qui voient les coûts de l'entreprise.",
    ],
    link: { href: "/app/catalogue/tarifs-fournisseurs", label: "Ouvrir les tarifs fournisseurs" },
  },
  {
    slug: "feuille-de-route",
    category: "compte",
    title: "Voter pour les prochaines fonctions",
    summary: "La feuille de route montre ce qui est à l'étude, prévu, en cours et livré ; vos votes fixent les priorités.",
    steps: [
      "Ouvrez Nouveautés puis « Voter pour la suite », ou la page Feuille de route.",
      "Cliquez sur le compteur d'un sujet pour le soutenir. Un second clic retire votre vote.",
      "Les sujets livrés restent affichés un an avec leur date de livraison.",
    ],
    notes: ["Les votes sont anonymes : seul leur nombre est publié. Pour proposer une idée absente de la liste, écrivez-nous depuis Assistance."],
    link: { href: "/app/feuille-de-route", label: "Ouvrir la feuille de route" },
  },
  {
    slug: "personnaliser-le-pdf",
    category: "devis",
    title: "Personnaliser l'apparence du PDF",
    summary: "Choisissez le modèle, la couleur, la police, la mise en page des nouveaux devis et une mention imprimée en bas de chaque page.",
    steps: [
      "Ouvrez Entreprise puis l'onglet Apparence.",
      "Choisissez le modèle, la couleur principale et la police : Helvetica, sans empattement, ou Times, avec empattement.",
      "Choisissez la mise en page proposée aux nouveaux devis : détaillée, récapitulatif en tête ou un lot par page.",
      "Ajoutez si besoin une mention de pied de page, par exemple vos qualifications ou votre fédération.",
      "Enregistrez, puis ouvrez l'aperçu : votre dernier devis s'affiche avec ces réglages.",
    ],
    notes: [
      "Les devis déjà émis gardent leur apparence d'origine : le PDF figé à l'émission ne change jamais.",
      "La mise en page reste modifiable devis par devis depuis l'éditeur.",
    ],
    link: { href: "/app/entreprise?onglet=apparence", label: "Ouvrir l'onglet Apparence" },
  },
  {
    slug: "aides-renovation-rge",
    category: "devis",
    title: "Devis pour MaPrimeRénov', CEE et éco-prêt à taux zéro",
    summary: "Enregistrez vos qualifications RGE, cochez les aides visées dans le devis : l'émission vérifie la qualification et le devis porte les mentions utiles au dossier.",
    steps: [
      "Dans Entreprise, onglet Assurance, ajoutez chaque qualification RGE : organisme, numéro, domaines couverts et date de fin de validité.",
      "Dans le devis, cochez les aides que le client demandera puis les domaines des travaux.",
      "Pour MaPrimeRénov', indiquez la date de la visite préalable du logement.",
      "Ajoutez si vous le souhaitez le montant d'aides estimé : le devis affiche le reste à charge estimé.",
      "Émettez : le devis cite votre qualification, la visite et les démarches à faire avant de signer ou de commencer.",
    ],
    notes: [
      "L'émission est bloquée si aucune qualification valide ne couvre un domaine coché. Une qualification qui expire avant la fin de validité du devis est signalée.",
      "Le montant d'aides reste une estimation : il ne change pas le total du devis.",
      "Les règles des aides évoluent souvent : vérifiez les conditions en vigueur auprès de France Rénov' et de l'organisme qui verse la prime.",
    ],
    link: { href: "/app/entreprise?onglet=assurance", label: "Gérer mes qualifications RGE" },
  },
  {
    slug: "tva-et-tresorerie",
    category: "factures",
    title: "Préparer la TVA et suivre sa trésorerie",
    summary: "La TVA due sur vos encaissements est calculée chaque mois, et la trésorerie des 3 prochains mois est estimée à partir de vos factures et devis signés.",
    steps: [
      "Ouvrez Rapports puis « TVA à déclarer ». Choisissez le mois, ou cochez « Déclaration trimestrielle ».",
      "Reportez les bases et la TVA par taux sur votre déclaration, après avoir ajouté la TVA de vos factures d'achat.",
      "Ouvrez « Trésorerie », saisissez votre solde bancaire et vos charges fixes mensuelles.",
      "Le tableau montre, mois par mois, les factures à encaisser, les devis signés à facturer, la TVA à reverser, les frais à rembourser et le solde estimé.",
    ],
    notes: [
      "Les travaux sont des prestations de services : la TVA est due à l'encaissement. Si vous avez opté pour les débits, utilisez le fichier des écritures comptables.",
      "Un bandeau vous prévient quand le solde estimé devient négatif.",
      "Ces calculs préparent votre travail et celui de votre comptable ; ils ne remplacent pas sa validation.",
    ],
    link: { href: "/app/rapports/tva", label: "Ouvrir la TVA à déclarer" },
  },
  {
    slug: "espace-expert-comptable",
    category: "compte",
    title: "Donner un accès à son expert-comptable",
    summary: "Votre cabinet consulte vos factures, votre TVA et votre trésorerie et télécharge le FEC avec vos propres comptes, sans rien pouvoir modifier.",
    steps: [
      "Dans Entreprise, onglet Comptabilité, reprenez les comptes de votre cabinet : clients, prestations, fournitures, acomptes, banque et TVA par taux.",
      "Cochez la ventilation si votre cabinet sépare la main-d'œuvre, les fournitures, la sous-traitance et les déplacements.",
      "Dans Équipe, invitez l'adresse de votre cabinet avec la fonction Expert-comptable.",
      "Votre cabinet arrive sur la page Comptabilité : factures, TVA à déclarer, trésorerie et fichier des écritures comptables.",
    ],
    notes: [
      "L'accès expert-comptable est en lecture seule et ne compte pas dans le nombre d'utilisateurs de votre offre.",
      "Les coûts et marges de vos chantiers restent invisibles pour le cabinet.",
    ],
    link: { href: "/app/comptabilite", label: "Ouvrir la comptabilité" },
  },
  {
    slug: "photos-et-croquis",
    category: "devis",
    title: "Joindre des photos annotées et des croquis",
    summary: "Montrez l'existant ou les cotes au client : les images annotées sont imprimées dans le PDF sous les totaux.",
    steps: [
      "Dans le devis, section Photos et croquis, choisissez « Ajouter une photo » (l'appareil photo s'ouvre sur téléphone) ou « Dessiner un croquis ».",
      "Annotez avec un trait libre, une flèche ou un texte, par exemple une cote. « Annuler » retire le dernier ajout.",
      "Ajoutez une légende puis « Ajouter au devis ». Réordonnez ou retirez les images depuis la liste.",
    ],
    notes: [
      "8 images au plus par devis. La position GPS et les informations de l'appareil sont retirées des photos.",
      "Les images sont figées dans la version émise : pour les changer, créez une nouvelle version.",
    ],
    link: { href: "/app/devis", label: "Ouvrir mes devis" },
  },
  {
    slug: "fiches-techniques",
    category: "catalogue",
    title: "Joindre fiches techniques et certificats",
    summary: "Déposez une fois les documents du fabricant sur l'article : chaque devis qui l'utilise les propose au client.",
    steps: [
      "Ouvrez l'article dans le Catalogue, section Fiches techniques et certificats.",
      "Choisissez le PDF, son type (fiche technique, certificat, notice de pose, fiche de données de sécurité) et un titre, puis « Joindre ».",
      "À l'émission, le devis cite ces documents et le client les télécharge réunis en un seul fichier depuis son lien.",
    ],
    notes: [
      "PDF uniquement, 5 Mo et 10 documents au plus par article.",
      "Retirer un document le masque du catalogue ; les devis déjà émis le gardent.",
      "Utile pour les aides à la rénovation : le certificat ACERMI d'un isolant ou la fiche d'une pompe à chaleur sont souvent demandés.",
    ],
    link: { href: "/app/catalogue", label: "Ouvrir le catalogue" },
  },
  {
    slug: "dicter-la-description",
    category: "devis",
    title: "Dicter la description d'un devis",
    summary: "Sur le chantier, dictez la description au lieu de la taper : le texte s'ajoute à la suite de ce qui est déjà écrit.",
    steps: [
      "Dans l'éditeur de devis ou l'Assistant de préparation, appuyez sur « Dicter » à côté de la description.",
      "Parlez normalement ; dites « virgule », « point » ou « à la ligne » pour ponctuer.",
      "Appuyez de nouveau sur le bouton pour arrêter. Relisez et corrigez le texte avant d'émettre le devis.",
    ],
    notes: [
      "La dictée utilise la reconnaissance vocale de votre navigateur (Chrome, Edge, Safari) ; le bouton n'apparaît pas quand le navigateur ne la propose pas.",
      "Le navigateur demande l'accès au micro la première fois.",
    ],
  },
  {
    slug: "envois-reessayes",
    category: "devis",
    title: "E-mails renvoyés automatiquement",
    summary: "Quand le service d'envoi est momentanément indisponible, l'e-mail n'est pas perdu : il repart tout seul un peu plus tard.",
    steps: [
      "Un envoi refusé pour une raison passagère apparaît dans E-mails envoyés avec la mention « Nouvel essai prévu ».",
      "De nouveaux essais ont lieu après 1, 2, 4, 8 minutes, puis à intervalles plus longs, jusqu'à six fois.",
      "Dès que l'e-mail part, il passe à « Envoyé » et un devis envoyé de cette façon passe à l'état envoyé.",
    ],
    notes: [
      "Une adresse refusée ou inexistante n'est pas réessayée : corrigez-la dans la fiche client puis renvoyez.",
      "Le PDF d'un devis émis ne change jamais : votre client le retrouve instantanément s'il l'a déjà ouvert.",
    ],
    link: { href: "/app/boite-envoi", label: "Voir les e-mails envoyés" },
  },
  {
    slug: "cles-d-acces",
    category: "compte",
    title: "Se connecter avec une clé d'accès",
    summary: "Plus besoin de taper le mot de passe : le téléphone ou l'ordinateur vous reconnaît par l'empreinte, le visage ou son code.",
    steps: [
      "Dans Mon compte, section Clés d'accès, donnez un nom à l'appareil si vous le souhaitez puis « Ajouter une clé d'accès ».",
      "Confirmez avec l'empreinte, le visage ou le code de l'appareil.",
      "À la prochaine connexion, choisissez « Se connecter avec une clé d'accès » sur la page de connexion.",
    ],
    notes: [
      "Une clé d'accès est liée à Pilot-Makers : un faux site ne peut pas s'en servir. Elle vaut double authentification.",
      "Le mot de passe reste utilisable. Retirez la clé d'un appareil perdu ou vendu depuis Mon compte.",
      "Jusqu'à 10 clés par compte, par exemple une pour le téléphone et une pour l'ordinateur du bureau.",
    ],
    link: { href: "/app/compte", label: "Ouvrir Mon compte" },
  },
  {
    slug: "fichier-refuse",
    category: "compte",
    title: "Un fichier est refusé par l'analyse de sécurité",
    summary: "Chaque photo, PDF ou justificatif déposé est analysé avant d'être enregistré ; un fichier suspect est refusé.",
    steps: [
      "Le message indique la raison : PDF contenant du JavaScript, fichier joint dans un PDF, image qui cache du code...",
      "Enregistrez de nouveau le document depuis sa source (site du fabricant, logiciel qui l'a produit) ou prenez-le en photo.",
      "Si le refus vous semble injustifié, écrivez à l'assistance en indiquant le nom du fichier.",
    ],
    notes: [
      "Les factures électroniques Factur-X, qui contiennent un fichier XML, sont acceptées.",
      "Les dépôts refusés sont notés dans le journal de sécurité de votre compte.",
    ],
  },
  {
    slug: "notifications-telephone",
    category: "compte",
    title: "Recevoir les notifications sur le téléphone",
    summary: "Soyez prévenu tout de suite qu'un client ouvre, accepte ou refuse un devis, vous écrit, ou qu'une demande arrive.",
    steps: [
      "Sur le téléphone, ouvrez Mon compte, section Notifications sur le téléphone, puis « Activer sur cet appareil ».",
      "Acceptez la demande d'autorisation du navigateur.",
      "Appuyez sur « Envoyer une notification d'essai » : elle arrive dans la minute. Toucher une notification ouvre le devis concerné.",
    ],
    notes: [
      "Sur iPhone, ajoutez d'abord Pilot-Makers à l'écran d'accueil (bouton Partager de Safari, puis « Sur l'écran d'accueil ») et activez depuis l'icône.",
      "Les notifications complètent les e-mails sans les remplacer. Activez-les sur chaque appareil, 10 au plus.",
      "Le contenu est chiffré pour votre seul appareil : le service de notifications du téléphone ne peut pas le lire.",
    ],
    link: { href: "/app/compte", label: "Ouvrir Mon compte" },
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
    slug: "application-et-affichage",
    category: "compte",
    title: "Installer l'application et régler l'affichage",
    summary: "Icône sur l'écran d'accueil, thème sombre, texte plus grand et boutons faciles à toucher sur le chantier.",
    steps: [
      "Ouvrez « Mon compte ». Dans « Application sur le téléphone », suivez l'indication de votre appareil pour installer Pilot-Makers.",
      "Dans « Affichage », choisissez le thème : comme l'appareil, clair ou sombre.",
      "Agrandissez le texte si besoin : toute l'interface suit, sans déborder de l'écran.",
      "Le contraste renforcé assombrit les textes secondaires et agrandit les boutons, pratique en plein soleil ou avec des gants.",
    ],
    notes: ["Sans réseau, l'application installée affiche une page d'attente : rien n'est perdu, vos documents restent sur le serveur."],
    link: { href: "/app/compte", label: "Ouvrir mon compte" },
  },
  {
    slug: "webhooks",
    category: "compte",
    title: "Relier Pilot-Makers à vos autres outils (webhooks)",
    summary: "Prévenir automatiquement un tableur, un outil d'automatisation ou un logiciel métier.",
    steps: [
      "Dans Mon entreprise, onglet Webhooks, indiquez l'adresse HTTPS qui recevra les envois et cochez les événements : devis signé, facture payée, client créé.",
      "Copiez la clé de signature affichée une seule fois et enregistrez-la dans l'outil qui reçoit.",
      "Cliquez sur « Tester » pour vérifier la réception, puis suivez le journal des derniers envois.",
    ],
    notes: [
      "Vérifiez la signature : HMAC-SHA256 de « horodatage.corps » avec votre clé, comparée à la valeur v1 de l'en-tête Pilot-Makers-Signature.",
      "Une réponse autre que 2xx déclenche jusqu'à 8 essais espacés. Réservé aux administrateurs de l'entreprise.",
    ],
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
