/**
 * Métrés : quantités calculées à partir des cotes relevées (en mètres), ouvertures déduites.
 *
 * - surface : longueur x largeur (sols, plafonds, dalles) ;
 * - murs : périmètre de la pièce x hauteur, portes et fenêtres déduites ;
 * - volume : longueur x largeur x hauteur ou épaisseur (béton, terrassement) ;
 * - lineaire : longueurs additionnées (gaines, gouttières) ;
 * - plinthes : périmètre de la pièce, largeur des portes déduite.
 *
 * Les calculs se font en millimètres entiers pour éviter les erreurs d'arrondi des nombres à virgule,
 * puis le total est arrondi au centième, comme une quantité de devis.
 */

export type MeasureKind = "surface" | "murs" | "volume" | "lineaire" | "plinthes";

export interface MeasureItem {
  label: string;
  count: string;
  a: string;
  b?: string;
  c?: string;
}

export interface Measure {
  kind: MeasureKind;
  items: MeasureItem[];
  /** Ouvertures déduites : nombre, largeur, hauteur (la hauteur est ignorée pour les plinthes) */
  deductions: MeasureItem[];
}

export const MEASURE_KINDS: Record<MeasureKind, { label: string; unit: string; dims: string[]; deduct: boolean; hint: string }> = {
  surface: { label: "Surface", unit: "m²", dims: ["Longueur", "Largeur"], deduct: true, hint: "Sols, plafonds, toitures" },
  murs: { label: "Murs d'une pièce", unit: "m²", dims: ["Longueur", "Largeur", "Hauteur"], deduct: true, hint: "Peinture, faïence, isolation" },
  volume: { label: "Volume", unit: "m³", dims: ["Longueur", "Largeur", "Hauteur ou épaisseur"], deduct: false, hint: "Béton, terrassement, remblai" },
  lineaire: { label: "Linéaire", unit: "ml", dims: ["Longueur"], deduct: false, hint: "Gaines, gouttières, bordures" },
  plinthes: { label: "Plinthes", unit: "ml", dims: ["Longueur", "Largeur"], deduct: true, hint: "Tour de pièce, portes déduites" },
};

export const MAX_MEASURE_ROWS = 60;

/** Cote en millimètres ; null si vide, négative ou illisible. Accepte la virgule et les espaces. */
export function parseMetres(v: string | undefined): number | null {
  const s = String(v ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!s) return null;
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(s)) return null;
  return Math.round(Number(s) * 1000);
}

function parseCount(v: string | undefined): number | null {
  const s = String(v ?? "").trim();
  if (!s) return 1;
  if (!/^\d{1,4}$/.test(s)) return null;
  return Number(s);
}

export interface MeasureRowResult {
  label: string;
  /** Quantité de la rangée, dans l'unité du métré (centièmes) */
  hundredths: number;
  formula: string;
}

export interface MeasureResult {
  ok: boolean;
  errors: string[];
  unit: string;
  rows: MeasureRowResult[];
  deductions: MeasureRowResult[];
  /** Total en centièmes de l'unité (14,25 m² = 1425) */
  totalHundredths: number;
  /** Quantité prête pour la ligne du devis (« 14,25 ») */
  quantity: string;
  /** Détail lisible, pour le commentaire interne ou la description */
  detail: string;
}

const fmt = (mm: number) => {
  const s = (mm / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
};
const fmtQty = (h: number) => (h / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");

/** Produit de cotes en mm, ramené en centièmes de l'unité (m, m² ou m³). */
function toHundredths(mmProduct: number, dims: number) {
  return Math.round(mmProduct / 10 ** (3 * dims - 2));
}

export function computeMeasure(m: Measure): MeasureResult {
  const spec = MEASURE_KINDS[m.kind];
  const errors: string[] = [];
  const rows: MeasureRowResult[] = [];
  const deductions: MeasureRowResult[] = [];
  if (!spec) return { ok: false, errors: ["Type de métré inconnu"], unit: "", rows, deductions, totalHundredths: 0, quantity: "", detail: "" };
  if (m.items.length + m.deductions.length > MAX_MEASURE_ROWS) errors.push(`${MAX_MEASURE_ROWS} rangées au plus`);

  m.items.forEach((it, i) => {
    const name = it.label.trim() || `Élément ${i + 1}`;
    const n = parseCount(it.count);
    const a = parseMetres(it.a);
    const b = parseMetres(it.b);
    const c = parseMetres(it.c);
    if (n === null) return errors.push(`${name} : nombre invalide`);
    const need = spec.dims.length;
    const vals = [a, b, c].slice(0, need);
    if (vals.some((v) => v === null)) return errors.push(`${name} : ${spec.dims.join(", ").toLowerCase()} à renseigner, en mètres`);
    const [x, y, z] = vals as number[];
    let h = 0;
    let formula = "";
    const times = n > 1 ? `${n} × ` : "";
    switch (m.kind) {
      case "surface":
        h = n * toHundredths(x * y, 2);
        formula = `${times}${fmt(x)} × ${fmt(y)}`;
        break;
      case "murs":
        h = n * toHundredths(2 * (x + y) * z, 2);
        formula = `${times}2 × (${fmt(x)} + ${fmt(y)}) × ${fmt(z)}`;
        break;
      case "volume":
        h = n * toHundredths(x * y * z, 3);
        formula = `${times}${fmt(x)} × ${fmt(y)} × ${fmt(z)}`;
        break;
      case "lineaire":
        h = n * toHundredths(x, 1);
        formula = `${times}${fmt(x)}`;
        break;
      case "plinthes":
        h = n * toHundredths(2 * (x + y), 1);
        formula = `${times}2 × (${fmt(x)} + ${fmt(y)})`;
        break;
    }
    rows.push({ label: name, hundredths: h, formula });
  });

  if (spec.deduct) {
    m.deductions.forEach((d, i) => {
      const name = d.label.trim() || `Ouverture ${i + 1}`;
      const n = parseCount(d.count);
      const w = parseMetres(d.a);
      const hgt = parseMetres(d.b);
      if (n === null) return errors.push(`${name} : nombre invalide`);
      if (w === null || (m.kind !== "plinthes" && hgt === null)) {
        return errors.push(`${name} : ${m.kind === "plinthes" ? "largeur" : "largeur et hauteur"} à renseigner, en mètres`);
      }
      const times = n > 1 ? `${n} × ` : "";
      const h = m.kind === "plinthes" ? n * toHundredths(w, 1) : n * toHundredths(w * hgt!, 2);
      deductions.push({ label: name, hundredths: h, formula: m.kind === "plinthes" ? `${times}${fmt(w)}` : `${times}${fmt(w)} × ${fmt(hgt!)}` });
    });
  }

  if (!rows.length && !errors.length) errors.push("Ajoutez au moins une rangée de cotes");
  const gross = rows.reduce((s, r) => s + r.hundredths, 0);
  const minus = deductions.reduce((s, r) => s + r.hundredths, 0);
  if (minus > gross && !errors.length) errors.push("Les ouvertures déduites dépassent la surface mesurée");
  const total = Math.max(0, gross - minus);
  const unit = spec.unit;
  const detail = [
    `Métré (${spec.label.toLowerCase()}) :`,
    ...rows.map((r) => `${r.label} : ${r.formula} = ${fmtQty(r.hundredths)} ${unit}`),
    ...deductions.map((r) => `à déduire, ${r.label} : ${r.formula} = ${fmtQty(r.hundredths)} ${unit}`),
    `Total : ${fmtQty(total)} ${unit}`,
  ].join("\n");
  return { ok: !errors.length, errors, unit, rows, deductions, totalHundredths: total, quantity: errors.length ? "" : fmtQty(total), detail };
}

export function emptyMeasure(kind: MeasureKind = "surface"): Measure {
  return { kind, items: [{ label: "", count: "1", a: "", b: "", c: "" }], deductions: [] };
}

/** Contrôle d'un métré reçu (brouillon enregistré) : structure et tailles bornées. */
export function sanitizeMeasure(raw: unknown): Measure | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !(r.kind in MEASURE_KINDS)) return null;
  const rowsOf = (v: unknown) =>
    (Array.isArray(v) ? v : []).slice(0, MAX_MEASURE_ROWS).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const str = (k: string, max: number) => String(o[k] ?? "").slice(0, max);
      return { label: str("label", 80), count: str("count", 6), a: str("a", 12), b: str("b", 12), c: str("c", 12) };
    });
  return { kind: r.kind as MeasureKind, items: rowsOf(r.items), deductions: rowsOf(r.deductions) };
}
