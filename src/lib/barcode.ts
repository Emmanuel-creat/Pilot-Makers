/** Codes-barres produits : EAN-8, UPC-A, EAN-13 et GTIN-14, contrôle de la clé et normalisation. */

export const GTIN_LENGTHS = [8, 12, 13, 14] as const;

/** Garde les chiffres d'un code saisi ou lu (espaces, tirets et préfixes de lecteur retirés). */
export function normalizeCode(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, "").slice(0, 40);
}

/** Clé de contrôle GTIN (modulo 10, poids 3 et 1 en partant de la droite) des chiffres sans la clé. */
export function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !(GTIN_LENGTHS as readonly number[]).includes(code.length)) return false;
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

export function codeKind(code: string): string {
  if (!isGtin(code)) return /^\d+$/.test(code) ? "Code numérique (clé non reconnue)" : "Référence";
  return { 8: "EAN-8", 12: "UPC-A", 13: "EAN-13", 14: "GTIN-14" }[code.length as 8 | 12 | 13 | 14];
}

/** Forme commune pour comparer : un UPC-A ou un GTIN-14 à zéro de tête devient l'EAN-13 équivalent. */
export function canonical(code: string): string {
  const c = normalizeCode(code);
  if (!isGtin(c)) return c.toUpperCase();
  if (c.length === 12) return `0${c}`;
  if (c.length === 14 && c.startsWith("0")) return c.slice(1);
  return c;
}

/** Variantes à chercher en base pour un code lu (stocké sous l'une ou l'autre forme). */
export function variants(code: string): string[] {
  const c = canonical(code);
  if (!c) return [];
  const out = new Set([c, normalizeCode(code)]);
  if (/^\d{13}$/.test(c)) {
    out.add(`0${c}`);
    if (c.startsWith("0")) out.add(c.slice(1));
  }
  return [...out];
}
