/**
 * Copie locale du brouillon d'un devis, pour travailler sans réseau.
 *
 * Chaque modification non encore enregistrée est gardée dans le navigateur. Au retour du réseau, ou à la
 * prochaine ouverture du devis, elle est envoyée au serveur. Le stockage du navigateur peut être indisponible
 * (navigation privée, stockage plein) : la copie est alors simplement absente.
 */

export interface LocalDraft<T> {
  draft: T;
  /** Révision du serveur sur laquelle la copie a été faite */
  baseRevision: number;
  savedAt: string;
}

const key = (id: string) => `pm-brouillon:${id}`;

export function saveLocalDraft<T>(id: string, draft: T, baseRevision: number, now = new Date()) {
  try {
    localStorage.setItem(key(id), JSON.stringify({ draft, baseRevision, savedAt: now.toISOString() }));
  } catch {
    // Stockage indisponible ou plein : le travail continue sans copie locale.
  }
}

export function readLocalDraft<T>(id: string): LocalDraft<T> | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalDraft<T>;
    return v && typeof v === "object" && "draft" in v && typeof v.baseRevision === "number" ? v : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(id: string) {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // Rien à effacer.
  }
}
