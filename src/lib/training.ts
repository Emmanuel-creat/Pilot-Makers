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
];

export const moduleById = (id: string) => MODULES.find((m) => m.id === id) ?? null;

/** Score d'un questionnaire : réponses données sous forme d'index (null si sans réponse). */
export function grade(m: TrainingModule, answers: (number | null)[]): { score: number; passed: boolean; corrections: { ok: boolean; why: string }[] } {
  const corrections = m.quiz.map((q, i) => ({ ok: answers[i] === q.answer, why: q.why }));
  const score = corrections.filter((c) => c.ok).length;
  return { score, passed: score >= PASS_SCORE, corrections };
}
