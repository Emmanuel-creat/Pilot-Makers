/**
 * Menu personnalisable : chaque utilisateur choisit les briques affichées dans sa navigation,
 * leur ordre et les raccourcis de la barre du téléphone. Les briques auxquelles son rôle ne donne
 * pas accès ne sont jamais proposées.
 */

export type MenuNeed = "costs" | "billing";

export interface MenuModule {
  key: string;
  href: string;
  label: string;
  icon: string;
  hint: string;
  needs?: MenuNeed;
}

export const MENU_MODULES: MenuModule[] = [
  { key: "devis", href: "/app/devis", label: "Devis", icon: "quote", hint: "Créer, envoyer et suivre les devis." },
  { key: "modeles", href: "/app/modeles", label: "Modèles de devis", icon: "copy", hint: "Devis types réutilisables." },
  { key: "factures", href: "/app/factures", label: "Factures", icon: "euro", hint: "Acomptes, soldes, avoirs et relances." },
  { key: "banque", href: "/app/banque", label: "Banque", icon: "card", hint: "Rapprochement du relevé avec les factures.", needs: "billing" },
  { key: "chantiers", href: "/app/chantiers", label: "Chantiers", icon: "hammer", hint: "Suivi, commandes, photos et journal." },
  { key: "planning", href: "/app/planning", label: "Planning", icon: "calendar", hint: "Interventions de l'équipe." },
  { key: "parc", href: "/app/parc", label: "Véhicules et outillage", icon: "truck", hint: "Entretiens et contrôles à prévoir." },
  { key: "stock", href: "/app/stock", label: "Stock", icon: "box", hint: "Dépôt, véhicules et seuils de réapprovisionnement." },
  { key: "pointage", href: "/app/pointage", label: "Pointage", icon: "clock", hint: "Heures passées par chantier." },
  { key: "frais", href: "/app/frais", label: "Notes de frais", icon: "note", hint: "Tickets photographiés et remboursements." },
  { key: "clients", href: "/app/clients", label: "Clients", icon: "users", hint: "Fiches, historique et espace client." },
  { key: "sous-traitants", href: "/app/sous-traitants", label: "Sous-traitants", icon: "shield", hint: "Documents et demandes de prix.", needs: "costs" },
  { key: "demandes", href: "/app/demandes", label: "Demandes", icon: "inbox", hint: "Demandes de devis reçues." },
  { key: "rapports", href: "/app/rapports", label: "Rapports", icon: "chart", hint: "Chiffre d'affaires, TVA, trésorerie." },
  { key: "comptabilite", href: "/app/comptabilite", label: "Comptabilité", icon: "archive", hint: "Exports pour le cabinet comptable.", needs: "billing" },
  { key: "catalogue", href: "/app/catalogue", label: "Catalogue", icon: "box", hint: "Prestations, fournitures et prix." },
  { key: "entraide", href: "/app/entraide", label: "Entraide", icon: "team", hint: "Questions et conseils entre artisans." },
  { key: "assistance", href: "/app/assistance", label: "Assistance", icon: "help", hint: "Rappel, séances de prise en main." },
];

export const DEFAULT_MAIN = [
  "devis",
  "modeles",
  "factures",
  "chantiers",
  "planning",
  "pointage",
  "frais",
  "clients",
  "sous-traitants",
  "demandes",
  "rapports",
  "comptabilite",
  "catalogue",
];
export const DEFAULT_MOBILE = ["devis", "clients", "catalogue"];
export const MOBILE_SLOTS = 3;

export interface MenuPrefs {
  main: string[];
  mobile: string[];
}

const byKey = new Map(MENU_MODULES.map((m) => [m.key, m]));

/** Préférences enregistrées nettoyées : briques connues, sans doublon, accessibles ; à défaut, le menu d'origine. */
export function resolveMenu(saved: unknown, allowed: (m: MenuModule) => boolean = () => true) {
  const o = (saved && typeof saved === "object" ? saved : {}) as { main?: unknown; mobile?: unknown };
  const clean = (v: unknown, fallback: string[]) => {
    const list = Array.isArray(v) ? v : fallback;
    const seen = new Set<string>();
    const out: MenuModule[] = [];
    for (const k of list) {
      const m = typeof k === "string" ? byKey.get(k) : undefined;
      if (m && !seen.has(m.key) && allowed(m)) {
        seen.add(m.key);
        out.push(m);
      }
    }
    return out;
  };
  const main = clean(o.main, DEFAULT_MAIN);
  const mobile = clean(o.mobile, DEFAULT_MOBILE).slice(0, MOBILE_SLOTS);
  const available = MENU_MODULES.filter(allowed);
  return { main, mobile, hidden: available.filter((m) => !main.includes(m)), available, customized: Array.isArray(o.main) };
}
