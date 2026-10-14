/**
 * Fiches produits enrichies : marque, performances, certifications, garantie du fabricant et délai
 * d'approvisionnement de chaque article du catalogue.
 */

export interface ProductInfo {
  brand: string;
  /** Performances déclarées : résistance thermique, classement UPEC, coefficient Uw... */
  performance: string;
  certifications: string;
  warrantyYears: number | null;
  /** Délai d'approvisionnement en jours ouvrés */
  leadDays: number | null;
}

export const EMPTY_PRODUCT_INFO: ProductInfo = { brand: "", performance: "", certifications: "", warrantyYears: null, leadDays: null };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

export function readProductInfo(raw: unknown): ProductInfo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    brand: text(r.brand, 80),
    performance: text(r.performance, 300),
    certifications: text(r.certifications, 200),
    warrantyYears: int(r.warrantyYears, 50),
    leadDays: int(r.leadDays, 365),
  };
}

export function isEmpty(p: ProductInfo): boolean {
  return !p.brand && !p.performance && !p.certifications && p.warrantyYears == null && p.leadDays == null;
}

/** Résumé d'une ligne pour le catalogue et le devis. */
export function productSummary(p: ProductInfo): string {
  return [
    p.brand,
    p.performance,
    p.certifications,
    p.warrantyYears != null ? `garantie ${p.warrantyYears} an${p.warrantyYears > 1 ? "s" : ""}` : "",
    p.leadDays != null ? `délai ${p.leadDays} jour${p.leadDays > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Article au délai d'approvisionnement le plus long : il fixe la date de démarrage au plus tôt. */
export function longestLead<T extends { label: string; info: ProductInfo }>(items: T[]): { label: string; days: number } | null {
  let best: { label: string; days: number } | null = null;
  for (const it of items) if (it.info.leadDays != null && it.info.leadDays > (best?.days ?? 0)) best = { label: it.label, days: it.info.leadDays };
  return best;
}
