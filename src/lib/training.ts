/**
 * Formation continue intégrée : modules courts sur les règles et techniques qui changent, chacun
 * terminé par trois questions. Un module est validé à partir de deux bonnes réponses sur trois.
 * Ces contenus aident à se tenir à jour ; ils ne remplacent ni une formation certifiante ni le
 * texte officiel cité en source.
 */

export type TrainingTopic = "reglementation" | "securite" | "gestion" | "environnement";

export const TRAINING_TOPICS: Record<TrainingTopic, string> = {
  reglementation: "Réglementation",
  securite: "Sécurité",
  gestion: "Gestion",
  environnement: "Environnement",
};

export interface Question {
  q: string;
  choices: string[];
  /** Index de la bonne réponse */
  answer: number;
  why: string;
}

export interface TrainingModule {
  id: string;
  topic: TrainingTopic;
  title: string;
  minutes: number;
  /** Date de mise à jour du contenu */
  updated: string;
  points: string[];
  source: string;
  quiz: [Question, Question, Question];
}

export const PASS_SCORE = 2;

export const MODULES: TrainingModule[] = [
  {
    id: "facture-electronique",
    topic: "gestion",
    title: "La facture électronique entre entreprises",
    minutes: 5,
    updated: "2026-10-14",
    points: [
      "Depuis le 1er septembre 2026, toute entreprise doit pouvoir recevoir des factures électroniques de ses fournisseurs.",
      "L'émission devient obligatoire le 1er septembre 2026 pour les grandes entreprises et les entreprises de taille intermédiaire, et le 1er septembre 2027 pour les PME et micro-entreprises.",
      "Une facture électronique n'est pas un PDF envoyé par e-mail : elle passe par une plateforme agréée, dans un format structuré (Factur-X, UBL ou CII).",
      "Les factures aux particuliers ne sont pas concernées par l'échange électronique, mais les données de vente sont transmises à l'administration (e-reporting).",
    ],
    source: "Calendrier de la facturation électronique, loi de finances pour 2024",
    quiz: [
      {
        q: "À partir de quand une PME du bâtiment doit-elle émettre ses factures entre entreprises au format électronique ?",
        choices: ["1er septembre 2026", "1er septembre 2027", "1er janvier 2030"],
        answer: 1,
        why: "Les PME et micro-entreprises émettent au 1er septembre 2027 ; la réception est obligatoire pour tous dès 2026.",
      },
      {
        q: "Un PDF envoyé par e-mail à un client professionnel est-il une facture électronique au sens de la réforme ?",
        choices: ["Oui", "Non"],
        answer: 1,
        why: "La facture doit être structurée et transiter par une plateforme agréée.",
      },
      {
        q: "Les factures à un particulier passent-elles par une plateforme agréée ?",
        choices: ["Oui, comme les autres", "Non, mais les données de vente sont transmises (e-reporting)"],
        answer: 1,
        why: "L'échange électronique ne vise que les ventes entre entreprises assujetties ; les autres ventes relèvent de l'e-reporting.",
      },
    ],
  },
  {
    id: "amiante-avant-travaux",
    topic: "securite",
    title: "Amiante : le repérage avant travaux",
    minutes: 6,
    updated: "2026-10-14",
    points: [
      "Dans un immeuble dont le permis de construire date d'avant le 1er juillet 1997, le donneur d'ordre doit faire réaliser un repérage de l'amiante avant travaux (RAT).",
      "Le repérage porte sur les matériaux touchés par les travaux, pas seulement sur ceux déjà connus : il est distinct du diagnostic de vente.",
      "Sans rapport de repérage, l'entreprise ne doit pas commencer : demandez-le avant de signer et joignez-le au dossier du chantier.",
      "Retirer ou encapsuler de l'amiante exige une certification spécifique ; les interventions ponctuelles (sous-section 4) exigent une formation des opérateurs et un mode opératoire.",
    ],
    source: "Code du travail, articles R4412-97 et suivants",
    quiz: [
      {
        q: "Pour quels bâtiments le repérage amiante avant travaux est-il exigé ?",
        choices: ["Permis de construire avant le 1er juillet 1997", "Tous les bâtiments de plus de 50 ans", "Seulement les bâtiments publics"],
        answer: 0,
        why: "La date de référence est le permis de construire délivré avant le 1er juillet 1997.",
      },
      {
        q: "Qui doit faire réaliser le repérage avant travaux ?",
        choices: ["L'artisan", "Le donneur d'ordre (le client ou le maître d'ouvrage)", "Le fournisseur"],
        answer: 1,
        why: "L'obligation pèse sur le donneur d'ordre ; l'artisan doit en demander le rapport.",
      },
      {
        q: "Le diagnostic amiante remis lors de la vente suffit-il pour percer et démolir ?",
        choices: ["Oui", "Non, il faut un repérage adapté aux travaux"],
        answer: 1,
        why: "Le diagnostic de vente ne couvre pas les matériaux cachés touchés par les travaux.",
      },
    ],
  },
  {
    id: "plomb-avant-1949",
    topic: "securite",
    title: "Plomb dans les peintures anciennes",
    minutes: 4,
    updated: "2026-10-14",
    points: [
      "Les logements construits avant le 1er janvier 1949 peuvent contenir des peintures au plomb : demandez le constat de risque d'exposition au plomb (CREP).",
      "Le ponçage à sec et le décapage thermique à haute température des peintures au plomb dégagent des poussières et des fumées dangereuses : préférez le décapage chimique ou le ponçage avec aspiration.",
      "Protégez la zone, aspirez avec un aspirateur à filtre très haute efficacité et nettoyez à l'humide en fin de journée.",
      "Les déchets de peinture au plomb sont des déchets dangereux, à évacuer par une filière adaptée.",
    ],
    source: "Code de la santé publique, articles L1334-5 et suivants",
    quiz: [
      {
        q: "Avant quelle date de construction faut-il se méfier des peintures au plomb ?",
        choices: ["1er janvier 1949", "1er juillet 1997", "1er janvier 1975"],
        answer: 0,
        why: "Le CREP concerne les logements construits avant le 1er janvier 1949.",
      },
      {
        q: "Quelle méthode limite le plus les poussières de plomb ?",
        choices: ["Ponçage à sec", "Décapage chimique ou ponçage avec aspiration", "Décapage au chalumeau"],
        answer: 1,
        why: "Le ponçage à sec et la chaleur dispersent le plomb.",
      },
      {
        q: "Comment nettoyer la zone en fin de journée ?",
        choices: ["Au balai", "À l'humide et avec un aspirateur à filtre très haute efficacité", "À la soufflette"],
        answer: 1,
        why: "Le balai et la soufflette remettent les poussières en suspension.",
      },
    ],
  },
  {
    id: "travail-en-hauteur",
    topic: "securite",
    title: "Travail en hauteur : les protections collectives d'abord",
    minutes: 4,
    updated: "2026-10-14",
    points: [
      "La protection collective (garde-corps, échafaudage, plateforme) passe avant la protection individuelle (harnais).",
      "L'échelle n'est pas un poste de travail : elle sert à accéder, ou à des travaux ponctuels de courte durée quand rien d'autre n'est possible.",
      "Un échafaudage se monte selon la notice du fabricant, par du personnel formé, et se vérifie avant chaque utilisation.",
      "Le harnais n'est utilisable qu'avec un point d'ancrage solide et une personne prête à intervenir en cas de chute.",
    ],
    source: "Code du travail, articles R4323-58 et suivants",
    quiz: [
      {
        q: "Quelle protection faut-il prévoir en priorité ?",
        choices: ["Le harnais", "Le garde-corps ou l'échafaudage", "Le casque"],
        answer: 1,
        why: "Les protections collectives protègent tout le monde sans dépendre du geste de chacun.",
      },
      {
        q: "Peut-on poser une fenêtre de toit plusieurs heures depuis une échelle ?",
        choices: ["Oui", "Non"],
        answer: 1,
        why: "L'échelle sert à l'accès ou à des travaux ponctuels de courte durée.",
      },
      {
        q: "Quand vérifier un échafaudage ?",
        choices: ["Une fois par an", "Avant chaque utilisation, et après tout événement qui a pu l'endommager", "Jamais si le montage est récent"],
        answer: 1,
        why: "Une vérification avant utilisation est indispensable ; le vent ou un choc peuvent l'avoir déstabilisé.",
      },
    ],
  },
  {
    id: "dechets-tri",
    topic: "environnement",
    title: "Tri des déchets de chantier",
    minutes: 4,
    updated: "2026-10-14",
    points: [
      "Les entreprises trient leurs déchets par flux : papier et carton, métal, plastique, verre, bois, fractions minérales et plâtre.",
      "Le devis doit indiquer la gestion des déchets prévue : quantités estimées, modalités de tri et point de collecte.",
      "Gardez les bons de dépôt : ils prouvent la bonne évacuation et sont à remettre au client qui les demande.",
      "Les déchets dangereux (amiante, plomb, solvants) ne se mélangent jamais aux autres.",
    ],
    source: "Code de l'environnement, tri sept flux et mentions obligatoires du devis",
    quiz: [
      {
        q: "Le plâtre fait-il partie des flux à trier séparément ?",
        choices: ["Oui", "Non"],
        answer: 0,
        why: "Le plâtre et les fractions minérales s'ajoutent aux cinq flux historiques.",
      },
      {
        q: "Que doit indiquer le devis sur les déchets ?",
        choices: ["Rien", "Quantités estimées, tri et point de collecte", "Seulement le prix de la benne"],
        answer: 1,
        why: "Ces mentions sont obligatoires sur les devis de travaux.",
      },
      {
        q: "Que garder après l'évacuation ?",
        choices: ["Les bons de dépôt", "Rien", "Une photo de la benne"],
        answer: 0,
        why: "Le bon de dépôt prouve la prise en charge par une installation autorisée.",
      },
    ],
  },
  {
    id: "rge-aides",
    topic: "reglementation",
    title: "RGE et aides à la rénovation",
    minutes: 5,
    updated: "2026-10-14",
    points: [
      "Les aides à la rénovation énergétique (MaPrimeRénov', primes CEE) exigent une entreprise qualifiée RGE pour les travaux concernés.",
      "La qualification RGE porte sur un domaine de travaux précis : vérifiez qu'elle couvre bien chaque poste du devis.",
      "Le devis doit mentionner la qualification (organisme, numéro, domaine) et les caractéristiques techniques exigées (résistance thermique, rendement).",
      "Le devis signé avant le dépôt du dossier d'aide fait perdre la prime CEE dans la plupart des offres : rappelez au client l'ordre des démarches.",
    ],
    source: "Conditions de MaPrimeRénov' et des certificats d'économies d'énergie",
    quiz: [
      {
        q: "Une qualification RGE en isolation couvre-t-elle l'installation d'une pompe à chaleur ?",
        choices: ["Oui, RGE couvre tout", "Non, chaque domaine a sa qualification"],
        answer: 1,
        why: "La qualification est attribuée par domaine de travaux.",
      },
      {
        q: "Que doit mentionner le devis pour une isolation aidée ?",
        choices: ["Seulement le prix", "La qualification RGE et la résistance thermique de l'isolant", "La marque du véhicule"],
        answer: 1,
        why: "Les caractéristiques techniques conditionnent l'aide.",
      },
      {
        q: "Pour la prime CEE, quand le client doit-il s'inscrire auprès du financeur ?",
        choices: ["Avant de signer le devis", "Après la fin des travaux"],
        answer: 0,
        why: "L'engagement du financeur doit précéder la signature dans la plupart des offres.",
      },
    ],
  },
  {
    id: "prix-de-revient",
    topic: "gestion",
    title: "Le prix de revient de l'heure de travail",
    minutes: 6,
    updated: "2026-10-15",
    points: [
      "Le prix de revient d'une heure additionne le salaire chargé et la part des frais généraux (véhicule, assurances, local, outillage, comptable), divisés par les heures réellement productives.",
      "Les heures productives sont bien moins nombreuses que les heures payées : congés, jours fériés, trajets, devis, administratif et intempéries les réduisent nettement.",
      "Un taux horaire fixé sur les heures payées plutôt que sur les heures productives fait travailler à perte sans le voir.",
      "Le prix de vente se calcule ensuite à partir du prix de revient, en ajoutant la marge visée, jamais en s'alignant seulement sur la concurrence.",
    ],
    source: "Méthode du coût de revient, chambres de métiers et de l'artisanat",
    quiz: [
      {
        q: "Par quoi divise-t-on les charges de l'année pour obtenir le prix de revient d'une heure ?",
        choices: ["Les heures payées", "Les heures réellement productives", "Les heures inscrites au contrat de travail"],
        answer: 1,
        why: "Seules les heures passées sur les chantiers et facturées couvrent les charges.",
      },
      {
        q: "Les frais du véhicule et de l'assurance décennale entrent-ils dans le prix de revient de l'heure ?",
        choices: ["Oui, au titre des frais généraux", "Non, ils se paient à part"],
        answer: 0,
        why: "Tous les frais de structure doivent être répartis sur les heures productives.",
      },
      {
        q: "Que risque une entreprise qui calcule son taux horaire sur les heures payées ?",
        choices: ["De surestimer ses prix", "De vendre en dessous de son prix de revient", "Rien, le résultat est le même"],
        answer: 1,
        why: "En divisant par trop d'heures, le coût de l'heure paraît plus faible qu'il n'est.",
      },
    ],
  },
  {
    id: "marge-coefficient",
    topic: "gestion",
    title: "Marge et coefficient de vente",
    minutes: 5,
    updated: "2026-10-15",
    points: [
      "Le coefficient de vente multiplie le prix de revient pour donner le prix de vente hors taxes.",
      "Le taux de marge sur le prix de vente se déduit du coefficient : un coefficient de 1,5 laisse un tiers du prix de vente en marge, soit environ 33 %.",
      "Une remise se prend sur la marge, jamais sur le coût : 10 % de remise sur un prix vendu avec 20 % de marge en fait disparaître la moitié.",
      "Suivre la marge chantier par chantier, entre le devis et le réalisé, montre les postes qui dérapent.",
    ],
    source: "Notions de base de gestion, chambres de métiers et de l'artisanat",
    quiz: [
      {
        q: "Avec un coefficient de 1,5 sur le prix de revient, quelle part du prix de vente est de la marge ?",
        choices: ["50 %", "Environ 33 %", "15 %"],
        answer: 1,
        why: "Sur 150 de prix de vente, 50 sont de la marge : un tiers.",
      },
      {
        q: "Une remise de 10 % accordée sur un prix qui contient 20 % de marge réduit la marge de :",
        choices: ["10 %", "La moitié", "Rien, la remise est absorbée par le volume"],
        answer: 1,
        why: "Les 10 points de remise sont pris sur les 20 points de marge.",
      },
      {
        q: "Comment repérer les postes qui font perdre de l'argent ?",
        choices: ["Comparer le devis au réalisé, chantier par chantier", "Regarder le chiffre d'affaires de l'année"],
        answer: 0,
        why: "Le chiffre d'affaires ne dit rien de la rentabilité de chaque chantier.",
      },
    ],
  },
  {
    id: "tresorerie-delais",
    topic: "gestion",
    title: "Trésorerie et délais de paiement",
    minutes: 6,
    updated: "2026-10-15",
    points: [
      "Entre entreprises, le délai de paiement ne peut dépasser 60 jours après la date de la facture, ou 45 jours fin de mois si le contrat le prévoit.",
      "Tout retard ouvre droit à des pénalités et à une indemnité forfaitaire de 40 euros pour frais de recouvrement, à mentionner sur la facture.",
      "Les acomptes à la commande et les situations de travaux évitent de financer le chantier à la place du client.",
      "Le besoin en fonds de roulement grandit avec les délais clients et les stocks : un chiffre d'affaires en hausse peut vider la trésorerie.",
    ],
    source: "Code de commerce, articles L441-10 et D441-5",
    quiz: [
      {
        q: "Quel est le délai de paiement maximal entre entreprises, compté depuis la date de la facture ?",
        choices: ["30 jours", "60 jours", "90 jours"],
        answer: 1,
        why: "60 jours date de facture, ou 45 jours fin de mois si c'est convenu.",
      },
      {
        q: "Quel montant forfaitaire est dû pour frais de recouvrement en cas de retard d'un client professionnel ?",
        choices: ["15 euros", "40 euros", "100 euros"],
        answer: 1,
        why: "L'indemnité forfaitaire est de 40 euros, en plus des pénalités de retard.",
      },
      {
        q: "Pourquoi une forte hausse du chiffre d'affaires peut-elle mettre la trésorerie en difficulté ?",
        choices: ["Parce que les achats et salaires se paient avant l'encaissement des factures", "Parce que la TVA baisse"],
        answer: 0,
        why: "Le besoin en fonds de roulement augmente avec l'activité.",
      },
    ],
  },
  {
    id: "tva-batiment",
    topic: "gestion",
    title: "La TVA dans le bâtiment",
    minutes: 6,
    updated: "2026-10-15",
    points: [
      "Le taux normal est de 20 %. Les travaux d'amélioration, de transformation et d'entretien d'un logement achevé depuis plus de deux ans relèvent de 10 %.",
      "Les travaux d'amélioration de la performance énergétique de ces logements relèvent de 5,5 %.",
      "En sous-traitance de travaux immobiliers, le sous-traitant facture hors taxes : c'est l'entreprise principale qui déclare la TVA (autoliquidation), avec une mention sur la facture.",
      "Le taux réduit suppose que le client confirme l'ancienneté et l'usage du logement : conservez cette confirmation avec le devis.",
    ],
    source: "Code général des impôts, articles 278-0 bis A, 279-0 bis et 283",
    quiz: [
      {
        q: "Quel taux s'applique à la rénovation d'une salle de bain dans une maison achevée il y a vingt ans ?",
        choices: ["20 %", "10 %", "5,5 %"],
        answer: 1,
        why: "Les travaux d'amélioration d'un logement de plus de deux ans relèvent du taux intermédiaire.",
      },
      {
        q: "Un sous-traitant de travaux facture l'entreprise principale :",
        choices: ["Avec la TVA à 20 %", "Hors taxes, avec la mention d'autoliquidation"],
        answer: 1,
        why: "L'entreprise principale autoliquide la TVA due sur la sous-traitance.",
      },
      {
        q: "L'isolation des combles d'un logement de plus de deux ans relève en principe du taux de :",
        choices: ["5,5 %", "10 %", "20 %"],
        answer: 0,
        why: "Les travaux d'amélioration de la performance énergétique relèvent du taux réduit.",
      },
    ],
  },
  {
    id: "assurances-garanties",
    topic: "reglementation",
    title: "Assurances et garanties après travaux",
    minutes: 5,
    updated: "2026-10-15",
    points: [
      "L'assurance de responsabilité décennale est obligatoire pour les travaux de construction ; ses références figurent sur chaque devis et chaque facture.",
      "La garantie de parfait achèvement dure un an après la réception : l'entreprise répare les désordres signalés pendant cette année.",
      "La garantie de bon fonctionnement couvre deux ans les équipements dissociables de l'ouvrage.",
      "La garantie décennale couvre dix ans les dommages qui compromettent la solidité de l'ouvrage ou le rendent impropre à sa destination.",
    ],
    source: "Code civil, articles 1792 à 1792-6 ; Code des assurances, article L241-1",
    quiz: [
      {
        q: "Combien de temps dure la garantie de parfait achèvement ?",
        choices: ["Un an", "Deux ans", "Dix ans"],
        answer: 0,
        why: "Elle court un an à partir de la réception des travaux.",
      },
      {
        q: "Où doivent figurer les références de l'assurance décennale ?",
        choices: ["Sur les devis et les factures", "Seulement sur le site de l'entreprise"],
        answer: 0,
        why: "L'assureur et la couverture géographique sont des mentions obligatoires.",
      },
      {
        q: "Une fissure qui compromet la solidité d'un mur relève de :",
        choices: ["La garantie de bon fonctionnement", "La garantie décennale"],
        answer: 1,
        why: "Les atteintes à la solidité de l'ouvrage relèvent de la décennale.",
      },
    ],
  },
  {
    id: "recouvrement",
    topic: "gestion",
    title: "Relances, mise en demeure et retenue de garantie",
    minutes: 5,
    updated: "2026-10-15",
    points: [
      "Relancer tôt et par écrit : un rappel aimable à l'échéance, puis une relance ferme, puis une mise en demeure par lettre recommandée.",
      "La mise en demeure fait courir les intérêts de retard et prépare une injonction de payer, procédure simple devant le tribunal.",
      "La retenue de garantie ne peut dépasser 5 % du montant des travaux ; elle est libérée un an après la réception si aucune réserve n'est notifiée.",
      "Elle peut être remplacée par une caution bancaire : la trésorerie de l'entreprise n'est alors pas bloquée.",
    ],
    source: "Loi du 16 juillet 1971 sur la retenue de garantie ; Code de procédure civile, injonction de payer",
    quiz: [
      {
        q: "Quel est le montant maximal de la retenue de garantie ?",
        choices: ["5 % du montant des travaux", "10 %", "Le montant de l'acompte"],
        answer: 0,
        why: "La loi de 1971 plafonne la retenue à 5 %.",
      },
      {
        q: "Quelle étape précède normalement une injonction de payer ?",
        choices: ["La mise en demeure par lettre recommandée", "Un avis en ligne"],
        answer: 0,
        why: "La mise en demeure constate le retard et ouvre la voie à la procédure.",
      },
      {
        q: "Comment éviter de bloquer la trésorerie avec la retenue de garantie ?",
        choices: ["La remplacer par une caution bancaire", "La facturer en plus"],
        answer: 0,
        why: "La caution d'un établissement financier remplace la somme retenue.",
      },
    ],
  },
  {
    id: "pilotage-indicateurs",
    topic: "gestion",
    title: "Piloter avec quelques indicateurs",
    minutes: 5,
    updated: "2026-10-15",
    points: [
      "Le taux de transformation rapporte les devis acceptés aux devis envoyés : il mesure l'efficacité commerciale.",
      "Le carnet de commandes, exprimé en mois de travail, dit combien de temps l'entreprise est occupée sans nouvelle signature.",
      "Le délai moyen d'encaissement mesure le temps entre la facture et le paiement ; il pèse directement sur la trésorerie.",
      "Le seuil de rentabilité est le chiffre d'affaires qui couvre toutes les charges : charges fixes divisées par le taux de marge sur coûts variables.",
    ],
    source: "Tableau de bord de l'entreprise artisanale",
    quiz: [
      {
        q: "Sur 40 devis envoyés, 12 sont acceptés. Quel est le taux de transformation ?",
        choices: ["12 %", "30 %", "40 %"],
        answer: 1,
        why: "12 divisé par 40 donne 30 %.",
      },
      {
        q: "Comment calcule-t-on le seuil de rentabilité ?",
        choices: ["Charges fixes divisées par le taux de marge sur coûts variables", "Chiffre d'affaires moins TVA"],
        answer: 0,
        why: "C'est le chiffre d'affaires dont la marge couvre exactement les charges fixes.",
      },
      {
        q: "Que mesure le carnet de commandes exprimé en mois ?",
        choices: ["Le temps d'activité assuré sans nouvelle signature", "Le délai moyen de paiement"],
        answer: 0,
        why: "Il indique la visibilité de l'entreprise sur son activité.",
      },
    ],
  },
];

export const moduleById = (id: string) => MODULES.find((m) => m.id === id) ?? null;

/** Score d'un questionnaire : réponses données sous forme d'index (null si sans réponse). */
export function grade(m: TrainingModule, answers: (number | null)[]): { score: number; passed: boolean; corrections: { ok: boolean; why: string }[] } {
  const corrections = m.quiz.map((q, i) => ({ ok: answers[i] === q.answer, why: q.why }));
  const score = corrections.filter((c) => c.ok).length;
  return { score, passed: score >= PASS_SCORE, corrections };
}
