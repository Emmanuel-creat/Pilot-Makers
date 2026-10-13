/**
 * Incohérences probables d'un devis : quantité anormale, prix hors norme, TVA inadaptée.
 *
 * Ce sont des avertissements, jamais des blocages : chaque règle repère une erreur de saisie
 * fréquente (virgule oubliée, mauvaise unité, taux réduit appliqué à tort), et l'artisan décide.
 */

import { parseScaled } from "@/lib/calc/decimal";

export interface AnomalyLine {
  id?: string;
  kind: string;
  nature: string;
  label: string;
  quantity?: string;
  unit?: string;
  unit_price?: string;
  unit_cost?: string;
  vat_percent: string;
  signed?: boolean;
}

export interface Anomaly {
  code: string;
  message: string;
  lineId?: string;
}

/** Quantité au-delà de laquelle une saisie est probablement erronée, par unité. */
export const MAX_QUANTITY: Record<string, number> = {
  "m²": 5000,
  "m³": 1000,
  ml: 5000,
  m: 5000,
  h: 2000,
  j: 250,
  u: 1000,
  forfait: 20,
  lot: 20,
  ens: 20,
  sac: 2000,
  kg: 100000,
  t: 1000,
  l: 10000,
};

/** Unités qui se comptent : une quantité décimale y est presque toujours une erreur. */
const WHOLE_UNITS = new Set(["u", "forfait", "lot", "ens", "sac"]);

/** Prix unitaire de main-d'œuvre au-delà duquel une saisie est suspecte. */
const MAX_LABOUR_PRICE: Record<string, number> = { h: 200, j: 1500 };

/** Rapport prix de vente sur coût au-delà duquel une virgule a probablement été oubliée. */
export const MAX_COEFFICIENT = 5;

/** Écart de prix entre deux lignes de même désignation et même unité jugé anormal. */
export const SAME_LABEL_RATIO = 3;

const ENERGY =
  /isol|pompe a chaleur|\bpac\b|chaudiere|poele|insert|vmc|ventilation|fenetre|menuiserie|vitrage|volet|porte d.entree|calorifug|solaire|thermostat|regulation|programma|biomasse|geotherm|thermodynamique|reseau de chaleur|granule|audit energ|etancheite a l.air|pare-vapeur|combles|rampant/;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function num(v: string | undefined, scale: number): number | null {
  if (!v || !v.trim()) return null;
  try {
    return Number(parseScaled(v, scale)) / 10 ** scale;
  } catch {
    return null;
  }
}

const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const name = (l: AnomalyLine) => (l.label.trim() ? `« ${l.label.trim()} »` : "Une ligne sans désignation");

export function findAnomalies(lines: readonly AnomalyLine[], opts: { vatApplies: boolean }): Anomaly[] {
  const out: Anomaly[] = [];
  const items = lines.filter((l) => l.kind === "item" && !l.signed);
  const hasLabour = items.some((l) => l.nature === "main_oeuvre" || l.nature === "forfait" || l.nature === "sous_traitance");
  const seen = new Map<string, { line: AnomalyLine; price: number }>();

  for (const l of items) {
    const unit = (l.unit ?? "").trim();
    const qty = num(l.quantity, 3);
    const price = num(l.unit_price, 4);
    const cost = num(l.unit_cost, 4);

    // Quantités
    const max = MAX_QUANTITY[unit];
    if (qty !== null && max !== undefined && qty > max) {
      out.push({ code: "quantity_high", lineId: l.id, message: `${name(l)} : ${fr(qty)} ${unit}, quantité inhabituelle. Vérifiez la saisie.` });
    } else if (qty !== null && WHOLE_UNITS.has(unit) && !Number.isInteger(qty)) {
      out.push({ code: "quantity_fraction", lineId: l.id, message: `${name(l)} : ${fr(qty)} ${unit}, une quantité qui se compte d'habitude en entiers.` });
    }

    // Prix
    if (price !== null && price > 0) {
      if (cost !== null && cost > price) {
        out.push({ code: "price_below_cost", lineId: l.id, message: `${name(l)} : vendue ${fr(price)} € pour un coût de ${fr(cost)} €, donc à perte.` });
      } else if (cost !== null && cost > 0 && price / cost > MAX_COEFFICIENT) {
        out.push({
          code: "price_coefficient",
          lineId: l.id,
          message: `${name(l)} : prix plus de ${MAX_COEFFICIENT} fois supérieur au coût. Une virgule a-t-elle été oubliée ?`,
        });
      }
      const labourMax = MAX_LABOUR_PRICE[unit];
      if (l.nature === "main_oeuvre" && labourMax !== undefined && price > labourMax) {
        out.push({ code: "price_labour", lineId: l.id, message: `${name(l)} : ${fr(price)} € par ${unit === "h" ? "heure" : "jour"}, tarif inhabituel.` });
      }
      const key = `${norm(l.label)}|${unit}`;
      const prev = norm(l.label) ? seen.get(key) : undefined;
      if (prev && Math.max(price, prev.price) / Math.min(price, prev.price) >= SAME_LABEL_RATIO) {
        out.push({
          code: "price_same_label",
          lineId: l.id,
          message: `${name(l)} figure deux fois avec des prix très différents (${fr(prev.price)} € et ${fr(price)} €).`,
        });
      } else if (norm(l.label) && !prev) seen.set(key, { line: l, price });
    }

    // TVA
    if (!opts.vatApplies) continue;
    const vat = num(l.vat_percent, 2);
    if (vat === 5.5 && !ENERGY.test(norm(l.label))) {
      out.push({
        code: "vat_energy",
        lineId: l.id,
        message: `${name(l)} : la TVA à 5,5 % est réservée aux travaux d'amélioration énergétique et à leurs travaux induits.`,
      });
    } else if ((vat === 5.5 || vat === 10) && l.nature === "materiau" && !hasLabour) {
      out.push({
        code: "vat_supply_only",
        lineId: l.id,
        message: `${name(l)} : fourniture sans pose au taux réduit. Le taux réduit suppose que l'entreprise pose le matériel, sinon c'est 20 %.`,
      });
    } else if (vat === 2.1) {
      out.push({ code: "vat_special", lineId: l.id, message: `${name(l)} : la TVA à 2,1 % ne s'applique pas aux travaux du bâtiment.` });
    } else if (vat === 0) {
      out.push({ code: "vat_zero", lineId: l.id, message: `${name(l)} : TVA à 0 %. Précisez la raison de l'exonération dans les conditions particulières.` });
    }
  }
  return out;
}
