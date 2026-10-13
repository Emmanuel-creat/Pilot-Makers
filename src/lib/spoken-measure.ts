/**
 * Cotes dictées sur le chantier : « cuisine trois mètres vingt par deux mètres dix », « 2 fois fenêtre 1,20 par 1,35 ».
 *
 * La reconnaissance vocale rend les nombres tantôt en chiffres, tantôt en lettres : les deux sont compris.
 * « trois mètres cinq » vaut 3,05 m (centimètres après les mètres), « trois virgule cinq » vaut 3,5 m,
 * « quarante centimètres » vaut 0,40 m. Les dimensions sont séparées par « par », « sur » ou « x ».
 */

import type { MeasureItem } from "@/lib/calc/measure";

const UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};

const DEDUCTIONS = /^(porte|portes|fenetre|fenetres|baie|baies|ouverture|ouvertures|porte-fenetre|velux|trappe)$/;

/** Mots sans accents ni ponctuation, « soixante-dix » coupé en deux mots. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*[,.]\s*(\d)/g, "$1#$2")
    .replace(/(\d)\s*x\s*(\d)/g, "$1 par $2")
    .replace(/[-']/g, " ")
    .replace(/[^a-z0-9# ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Lit un nombre écrit en lettres à partir de la position i ; renvoie sa valeur et la position suivante. */
function readNumberWords(w: string[], i: number): { value: number; next: number } | null {
  let total = 0;
  let current = 0;
  let j = i;
  let seen = false;
  while (j < w.length) {
    const t = w[j];
    if (t === "et" && seen && j + 1 < w.length && (w[j + 1] === "un" || w[j + 1] === "une" || w[j + 1] === "onze")) {
      j++;
      continue;
    }
    if (t === "cent" || t === "cents") {
      current = (current || 1) * 100;
    } else if (t === "mille") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (t === "quatre" && (w[j + 1] === "vingt" || w[j + 1] === "vingts")) {
      current += 80;
      j++;
    } else if (t in UNITS) {
      const v = UNITS[t];
      // soixante-dix, quatre-vingt-douze : la dizaine précédente se complète de 10 à 19.
      if (v >= 10 && v < 20 && (current % 100 === 60 || current % 100 === 80)) current += v;
      else if (v < 10 && current % 10 === 0 && current % 100 >= 20) current += v;
      else if (seen && v < 100 && current % 100 !== 0 && v >= 1) break;
      else current += v;
    } else break;
    seen = true;
    j++;
  }
  return seen ? { value: total + current, next: j } : null;
}

/** Nombre en chiffres (« 3#20 » pour 3,20) ou en lettres. `digits` garde l'écriture des décimales. */
function readNumber(w: string[], i: number): { value: number; text: string; next: number } | null {
  const t = w[i];
  if (t !== undefined && /^\d+(#\d+)?$/.test(t)) return { value: Number(t.replace("#", ".")), text: t.replace("#", "."), next: i + 1 };
  const n = readNumberWords(w, i);
  return n ? { value: n.value, text: String(n.value), next: n.next } : null;
}

const METRE = /^(m|metre|metres|mettre|mettres)$/;
const CENTI = /^(cm|centimetre|centimetres)$/;
const SEPARATORS = /^(par|sur|x|fois)$/;

/** Une dimension en mètres, écrite avec un point (pour parseMetres). */
function readDimension(w: string[], i: number): { metres: string; next: number } | null {
  const n = readNumber(w, i);
  if (!n) return null;
  let j = n.next;
  if (w[j] === "virgule") {
    let zeros = "";
    let k = j + 1;
    while (w[k] === "zero") {
      zeros += "0";
      k++;
    }
    const dec = readNumber(w, k);
    if (!dec || !Number.isInteger(dec.value)) return null;
    return { metres: `${n.value}.${zeros}${dec.value}`, next: dec.next };
  }
  if (w[j] !== undefined && CENTI.test(w[j])) return { metres: String(n.value / 100), next: j + 1 };
  if (w[j] !== undefined && METRE.test(w[j])) {
    j++;
    const cm = readNumber(w, j);
    if (cm && Number.isInteger(cm.value) && cm.value < 100 && !(w[cm.next] !== undefined && METRE.test(w[cm.next]))) {
      return { metres: `${n.value}.${String(cm.value).padStart(2, "0")}`, next: cm.next };
    }
  }
  return { metres: n.text, next: j };
}

export interface SpokenMeasure {
  /** Ouverture à déduire (porte, fenêtre) plutôt que cote relevée */
  deduction: boolean;
  item: MeasureItem;
}

/** Comprend une cote dictée ; null si aucune dimension n'est reconnue. */
export function parseSpokenMeasure(text: string, maxDims = 3): SpokenMeasure | null {
  const w = words(text);
  let i = 0;
  let count = "1";
  const label: string[] = [];
  // Nombre de répétitions en tête : « deux fois », « 3 x » suivi d'un libellé.
  const head = readNumber(w, 0);
  if (head && w[head.next] === "fois" && Number.isInteger(head.value) && head.value > 0) {
    count = String(head.value);
    i = head.next + 1;
  }
  while (i < w.length && !readNumber(w, i)) {
    if (!/^(de|du|la|le|les|l|d|hauteur|longueur|largeur)$/.test(w[i])) label.push(w[i]);
    i++;
  }
  const dims: string[] = [];
  while (i < w.length && dims.length < maxDims) {
    if (SEPARATORS.test(w[i]) || /^(hauteur|longueur|largeur|et|de)$/.test(w[i])) {
      i++;
      continue;
    }
    const d = readDimension(w, i);
    if (!d) break;
    dims.push(d.metres);
    i = d.next;
  }
  if (!dims.length) return null;
  const original = text.trim().split(/\s+/);
  const deduction = label.length > 0 && DEDUCTIONS.test(label[0]);
  // Le libellé garde les accents de la dictée quand c'est possible.
  const pretty = label.map((l) => original.find((o) => o.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === l) ?? l).join(" ");
  const fr = (v: string) => v.replace(".", ",");
  return {
    deduction,
    item: { label: pretty.slice(0, 80), count, a: fr(dims[0]), b: dims[1] ? fr(dims[1]) : "", c: dims[2] ? fr(dims[2]) : "" },
  };
}
