/**
 * Mode facile : de grands pictogrammes, des phrases courtes lues à voix haute et une commande
 * vocale, pour les personnes peu à l'aise avec l'écrit. Chaque pictogramme mène à un écran
 * existant ; la voix ne fait jamais d'action seule, elle ouvre l'écran demandé.
 */

export interface EasyTile {
  id: string;
  href: string;
  icon: string;
  label: string;
  say: string;
  keywords: string[];
  needs?: "billing";
}

export const EASY_TILES: EasyTile[] = [
  {
    id: "devis",
    href: "/app/devis/nouveau",
    icon: "quote",
    label: "Faire un devis",
    say: "Faire un devis. Vous choisissez le client, puis vous dictez les travaux.",
    keywords: ["devis", "chiffrer", "chiffrage", "prix"],
  },
  {
    id: "journee",
    href: "/app/ma-journee",
    icon: "sun",
    label: "Ma journée",
    say: "Ma journée. Les chantiers du jour et l'adresse où aller.",
    keywords: ["journee", "aujourd", "programme", "ou aller"],
  },
  {
    id: "pointage",
    href: "/app/pointage",
    icon: "clock",
    label: "Mes heures",
    say: "Mes heures. Vous notez l'heure d'arrivée et de départ du chantier.",
    keywords: ["heure", "pointer", "pointage", "arrive", "parti"],
  },
  {
    id: "chantiers",
    href: "/app/chantiers",
    icon: "truck",
    label: "Mes chantiers",
    say: "Mes chantiers. La liste des chantiers en cours, avec les photos et les notes.",
    keywords: ["chantier", "photo", "travaux"],
  },
  {
    id: "clients",
    href: "/app/clients",
    icon: "users",
    label: "Mes clients",
    say: "Mes clients. Le numéro de téléphone et l'adresse de chaque client.",
    keywords: ["client", "appeler", "telephone", "numero"],
  },
  {
    id: "factures",
    href: "/app/factures",
    icon: "euro",
    label: "Mes factures",
    say: "Mes factures. Les factures envoyées et celles qui attendent d'être payées.",
    keywords: ["facture", "paye", "paiement", "argent", "reglement"],
    needs: "billing",
  },
  {
    id: "frais",
    href: "/app/frais",
    icon: "note",
    label: "Mes frais",
    say: "Mes frais. Vous prenez le ticket en photo, c'est enregistré.",
    keywords: ["frais", "ticket", "essence", "carburant", "repas"],
  },
  {
    id: "demandes",
    href: "/app/demandes",
    icon: "inbox",
    label: "Nouvelles demandes",
    say: "Nouvelles demandes. Les personnes qui veulent un devis.",
    keywords: ["demande", "nouveau client", "message"],
  },
  {
    id: "aide",
    href: "/app/assistance",
    icon: "help",
    label: "Être aidé",
    say: "Être aidé. Vous demandez qu'on vous rappelle.",
    keywords: ["aide", "aider", "rappel", "comprends pas", "probleme"],
  },
];

export function tilesFor(perms: { billing: boolean }): EasyTile[] {
  return EASY_TILES.filter((t) => t.needs !== "billing" || perms.billing);
}

/** Texte sans accents ni majuscules, pour comparer une phrase dictée aux mots-clés. */
export function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
}

/** Pictogramme correspondant à une phrase dictée (« je veux faire un devis »), ou null. */
export function matchTile(text: string, tiles: EasyTile[] = EASY_TILES): EasyTile | null {
  const said = ` ${plain(text)} `;
  if (!said.trim()) return null;
  let best: { tile: EasyTile; hits: number; first: number } | null = null;
  for (const tile of tiles) {
    let hits = 0;
    let first = Infinity;
    for (const k of tile.keywords) {
      const at = said.indexOf(` ${k}`);
      if (at >= 0) {
        hits += 1;
        first = Math.min(first, at);
      }
    }
    if (hits && (!best || hits > best.hits || (hits === best.hits && first < best.first))) best = { tile, hits, first };
  }
  return best?.tile ?? null;
}

const count = (n: number, one: string, many: string) => `${n === 0 ? "aucun" : n} ${n > 1 ? many : one}`;

/** Résumé du jour en phrases courtes, pour la lecture à voix haute. */
export function daySentence(day: { jobs: { title: string; city: string }[]; quotes: { count: number } }): string {
  const parts: string[] = [];
  if (!day.jobs.length) parts.push("Aujourd'hui, aucun chantier n'est prévu.");
  else {
    parts.push(`Aujourd'hui, vous avez ${count(day.jobs.length, "chantier", "chantiers")}.`);
    for (const j of day.jobs.slice(0, 5)) parts.push(j.city ? `${j.title}, à ${j.city}.` : `${j.title}.`);
    if (day.jobs.length > 5) parts.push(`Et ${day.jobs.length - 5} autres.`);
  }
  const q = day.quotes.count;
  parts.push(q ? `${q} ${q > 1 ? "devis attendent" : "devis attend"} la réponse du client.` : "Aucun devis n'attend de réponse.");
  return parts.join(" ");
}
