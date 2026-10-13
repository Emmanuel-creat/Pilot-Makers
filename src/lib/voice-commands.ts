/**
 * Compréhension des demandes faites à l'assistant vocal, phrase dictée ou tapée.
 *
 * Moteur à règles, local : rien n'est envoyé à un service tiers. Il reconnaît des gestes précis
 * (ouvrir un écran, créer un client ou un devis, noter un frais, enregistrer un paiement, répondre
 * à une question sur l'activité) et renvoie une intention structurée. Rien n'est exécuté ici : les
 * actions sont relues et confirmées par l'utilisateur avant d'être faites.
 */

export type VoiceIntent =
  | { kind: "navigate"; href: string; label: string }
  | { kind: "search"; query: string }
  | { kind: "create_customer"; firstName: string; lastName: string; company: string; phone: string; email: string; city: string }
  | { kind: "create_quote"; words: string }
  | { kind: "expense"; amount: string; category: string; merchant: string; payment: "perso" | "entreprise" }
  | { kind: "payment"; invoiceRef: string; customer: string; amount: string; method: string }
  | { kind: "question"; topic: "overdue" | "to_collect" | "pending_quotes" | "today" }
  | { kind: "help"; query: string };

/** Minuscules sans accents, espaces simplifiés : pour reconnaître les mots, pas pour les recopier. */
export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const SCREENS: [RegExp, string, string][] = [
  [/notes? de frais|\bfrais\b/, "/app/frais", "Notes de frais"],
  [/rapprochement|\bbanque\b|releve/, "/app/banque", "Banque"],
  [/\btva\b/, "/app/rapports/tva", "TVA à déclarer"],
  [/tresorerie/, "/app/rapports/tresorerie", "Trésorerie"],
  [/comptab/, "/app/comptabilite", "Comptabilité"],
  [/modeles?/, "/app/modeles", "Modèles de devis"],
  [/\bdevis\b/, "/app/devis", "Devis"],
  [/factures?|avoirs?/, "/app/factures", "Factures"],
  [/sous[- ]traitants?/, "/app/sous-traitants", "Sous-traitants"],
  [/clients?/, "/app/clients", "Clients"],
  [/chantiers?/, "/app/chantiers", "Chantiers"],
  [/planning|agenda|calendrier/, "/app/planning", "Planning"],
  [/pointage|heures/, "/app/pointage", "Pointage"],
  [/catalogue|prestations|articles/, "/app/catalogue", "Catalogue"],
  [/rapports?|statistiques|chiffre d'affaires/, "/app/rapports", "Rapports"],
  [/demandes/, "/app/demandes", "Demandes"],
  [/equipe|salaries/, "/app/equipe", "Équipe"],
  [/abonnement/, "/app/abonnement", "Abonnement"],
  [/mon compte|\bcompte\b|mot de passe/, "/app/compte", "Mon compte"],
  [/entreprise|parametres|reglages/, "/app/entreprise", "Entreprise"],
  [/menu/, "/app/menu", "Personnaliser le menu"],
  [/assistance|support|conseiller/, "/app/assistance", "Assistance"],
  [/e-?mails?|courriels?/, "/app/boite-envoi", "E-mails envoyés"],
  [/tableau de bord|accueil/, "/app", "Tableau de bord"],
];

/** Montant dit ou tapé : « 23 euros 40 », « 23,40 € », « 1 250 euros ». Renvoie « 23,40 » ou "". */
export function spokenAmount(text: string): string {
  const t = text.replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
  let m = /(\d+)\s*(?:euros?|€)\s*(?:et\s*)?(\d{1,2})\b(?!\s*(?:euros?|€|%))/i.exec(t);
  if (m) return `${m[1]},${m[2].padEnd(2, "0")}`;
  m = /(\d+)(?:[.,](\d{1,2}))?\s*(?:euros?|€)/i.exec(t);
  if (m) return m[2] ? `${m[1]},${m[2].padEnd(2, "0")}` : m[1];
  return "";
}

export function spokenPhone(text: string): string {
  const m = /(?:\+33\s*|0)[1-9](?:[\s.-]*\d{2}){4}/.exec(text);
  if (!m) return "";
  let d = m[0].replace(/[\s.-]/g, "");
  if (d.startsWith("+33")) d = "0" + d.slice(3);
  return d.replace(/(\d{2})(?=\d)/g, "$1 ");
}

export function spokenEmail(text: string): string {
  const t = text
    .replace(/\s+arobase\s+/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/(@[\w-]+)\s+point\s+/gi, "$1.");
  const m = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(t);
  return m ? m[0].toLowerCase() : "";
}

const capitalize = (w: string) => w.replace(/(^|[-\s])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

function customerFromWords(raw: string) {
  const phone = spokenPhone(raw);
  const email = spokenEmail(raw);
  let rest = raw;
  // Ce qui suit le nom : coordonnées et ville.
  const cut = rest.search(/\s(?:au|tel|téléphone|telephone|numéro|numero|mail|e-mail|email|adresse|courriel|qui habite|habitant|domicilié|domicilie|à|a|de)\s|\s(?:\+33|0)[1-9]|\S+@/i);
  const tail = cut >= 0 ? rest.slice(cut) : "";
  if (cut >= 0) rest = rest.slice(0, cut);
  const cityMatch = /\s(?:qui habite|habitant|domicilié|domicilie)?\s*(?:à|a)\s+([\p{L}][\p{L}' -]{1,60}?)(?=\s+(?:au|tel|téléphone|telephone|numéro|numero|mail|e-mail|email|courriel|et)\b|\s*$|\s*[,.])/iu.exec(tail);
  rest = rest.replace(/^(?:monsieur|madame|m\.|mme)\s+/i, "").replace(/[,.]+$/, "").trim();
  const isCompany = /^(?:la\s+)?(?:société|societe|entreprise|sarl|sas|eurl|sci|syndic)(?=\s|$)/i.test(rest);
  const name = rest.replace(/^(?:la\s+)?(?:société|societe|entreprise)\s+/i, "").trim();
  const words = name.split(/\s+/).filter(Boolean);
  return {
    firstName: isCompany || words.length < 2 ? "" : capitalize(words.slice(0, -1).join(" ")),
    lastName: isCompany ? "" : words.length ? capitalize(words[words.length - 1]) : "",
    company: isCompany ? capitalize(name) : "",
    phone,
    email,
    city: cityMatch ? capitalize(cityMatch[1].trim()) : "",
  };
}

const EXPENSE_WORDS: [RegExp, string][] = [
  [/restaurant|repas|dejeuner|diner|sandwich|cafe/, "repas"],
  [/essence|gasoil|gazole|carburant|plein/, "carburant"],
  [/peage|parking|stationnement/, "peage_parking"],
  [/hotel|hebergement|nuit/, "hebergement"],
  [/train|taxi|bus|metro|avion|transport/, "transport"],
  [/fournitures?|quincaillerie|visserie|outil/, "fournitures"],
];

/** Analyse d'une phrase. */
export function parseCommand(input: string): VoiceIntent {
  const text = input.replace(/\s+/g, " ").trim();
  const f = fold(text);

  // Questions sur l'activité (lecture seule).
  if (/\?$/.test(text) || /^(?:quels?|quelles?|combien|est-ce|qu'est|ou en|on en est)/.test(f)) {
    if (/retard|impaye/.test(f)) return { kind: "question", topic: "overdue" };
    if (/encaisser|me doit|on me doit|doivent|reste a payer|a recevoir/.test(f)) return { kind: "question", topic: "to_collect" };
    if (/devis/.test(f) && /attente|reponse|en cours|signer|accepte/.test(f)) return { kind: "question", topic: "pending_quotes" };
    if (/aujourd'hui|ma journee|programme|planning du jour/.test(f)) return { kind: "question", topic: "today" };
  }

  // Note de frais.
  if (/notes? de frais|\bfrais de\b|j'ai (?:paye|depense)|depense de/.test(f)) {
    const amount = spokenAmount(text);
    const category = EXPENSE_WORDS.find(([re]) => re.test(f))?.[1] ?? "autre";
    const merchant = /\b(?:chez|au|à la|a la|à l'|a l')\s+([\p{L}0-9][\p{L}0-9' &-]{1,60}?)(?=\s+(?:pour|de|du|avec|payé|paye|par|le|ce)\b|[,.]|$)/iu.exec(text)?.[1] ?? "";
    const payment = /carte (?:de l'|pro|bleue de l')?entreprise|carte pro|compte (?:de l')?entreprise/.test(f) ? "entreprise" : "perso";
    return { kind: "expense", amount, category, merchant: merchant.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()), payment };
  }

  // Paiement reçu.
  const invRef = /factures?\s+(?:n(?:°|o|umero)\s*)?([a-z]{0,4}[\s-]?\d[\d\s-]{1,14}\d)/i.exec(text)?.[1]?.replace(/\s+/g, "") ?? "";
  const paid = /(?:paye|regle|encaisse|recu|vire)e?s?\b/.test(f) || /(?:enregistre|note|saisis|encaisse)r?\s+(?:un |le |ce )?(?:paiement|reglement|virement|cheque|versement)/.test(f);
  if (paid && /(facture|paiement|reglement|virement|cheque|acompte|solde)/.test(f)) {
    const method = /cheque/.test(f) ? "cheque" : /carte/.test(f) ? "carte" : /especes|liquide/.test(f) ? "especes" : "virement";
    const who = /(?:de|du client|client|pour)\s+((?:m\.|mme|monsieur|madame)?\s*[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+)?)/u.exec(text)?.[1] ?? "";
    const byName = /^((?:m\.|mme|monsieur|madame)?\s*[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+)?)\s+(?:a|m'a)\s+(?:payé|réglé|viré)/u.exec(text)?.[1] ?? "";
    return { kind: "payment", invoiceRef: invRef, customer: (byName || who).replace(/^(?:m\.|mme|monsieur|madame)\s*/i, "").trim(), amount: spokenAmount(text), method };
  }

  // Nouveau client.
  const cust = /(?:ajoute|ajouter|crée|cree|créer|creer|enregistre|nouveau|nouvelle)\s+(?:un |une |le |la )?(?:nouveau |nouvelle )?(?:cliente|client)\b\s*:?\s+(.+)/i.exec(text);
  if (cust) return { kind: "create_customer", ...customerFromWords(cust[1]) };

  // Nouveau devis.
  const quote = /(?:crée|cree|créer|creer|fais|faire|prépare|prepare|préparer|preparer|nouveau|démarre|demarre|commence)\s+(?:moi\s+)?(?:un\s+)?(?:nouveau\s+)?devis\b(?:\s+(?:pour|à|a|chez)\s+)?(.*)/i.exec(text);
  if (quote) return { kind: "create_quote", words: quote[1].replace(/[.]+$/, "").trim() };

  // Recherche.
  const search = /^(?:cherche|recherche|trouve|retrouve)(?:-moi)?\s+(?:le |la |les |un |une )?(.+)/i.exec(text);
  if (search) return { kind: "search", query: search[1].replace(/[.?]+$/, "").trim() };

  // Ouvrir un écran.
  if (/^(?:ouvre|ouvrir|va |aller|allez|affiche|afficher|montre|montrer|voir|accede|emmene|go|je veux voir|mets?-moi)/.test(f) || f.split(" ").length <= 3) {
    for (const [re, href, label] of SCREENS) if (re.test(f)) return { kind: "navigate", href, label };
  }

  return { kind: "help", query: text };
}
