/**
 * Conversion entre textes décimaux (saisie française ou anglaise) et entiers
 * mis à l'échelle. Aucun nombre flottant n'intervient dans les montants.
 */

export class DecimalError extends Error {}

/**
 * Convertit "12,5" ou "12.5" en entier mis à l'échelle (scale = nombre de décimales).
 * Exemple : parseScaled("12,5", 3) === 12500n.
 * Refuse les valeurs ayant plus de décimales que l'échelle autorisée.
 */
export function parseScaled(input: string | number, scale: number): bigint {
  let text = typeof input === "number" ? numberToPlain(input) : input;
  text = text.trim().replace(/[\s  ]/g, "").replace(",", ".");
  if (text === "") throw new DecimalError("Valeur vide");
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new DecimalError(`Nombre invalide : ${String(input)}`);
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const intPart = match[2] === "" ? "0" : match[2];
  let frac = match[3] ?? "";
  frac = frac.replace(/0+$/, "");
  if (frac.length > scale) {
    throw new DecimalError(`Trop de décimales (maximum ${scale}) : ${String(input)}`);
  }
  frac = frac.padEnd(scale, "0");
  return sign * BigInt(intPart + frac);
}

/** Convertit un entier mis à l'échelle en texte décimal avec un point. */
export function formatScaled(value: bigint, scale: number, minDecimals = 0): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const raw = abs.toString().padStart(scale + 1, "0");
  const intPart = raw.slice(0, raw.length - scale);
  let frac = scale > 0 ? raw.slice(raw.length - scale) : "";
  frac = frac.replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");
  return (negative ? "-" : "") + intPart + (frac ? "." + frac : "");
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new DecimalError("Nombre non fini");
  // toFixed(10) évite la notation exponentielle ; les zéros de fin sont retirés ensuite.
  return n.toFixed(10);
}

/**
 * Division entière arrondie au plus proche, demi vers l'extérieur de zéro.
 * C'est la règle d'arrondi unique de toute l'application.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new DecimalError("Division par zéro");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const q = abs / denominator;
  const r = abs % denominator;
  const rounded = r * 2n >= denominator ? q + 1n : q;
  return negative ? -rounded : rounded;
}
