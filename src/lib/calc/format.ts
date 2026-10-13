/**
 * Mise en forme française des montants, quantités et taux.
 * Les espaces sont des espaces simples pour rester compatibles avec le PDF.
 */

import { formatScaled } from "./decimal";

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 123456 -> "1 234,56 €" */
export function formatEuros(cents: number | bigint, withSymbol = true): string {
  const v = typeof cents === "bigint" ? cents : BigInt(cents);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const intPart = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0");
  return (negative ? "-" : "") + groupThousands(intPart) + "," + frac + (withSymbol ? " €" : "");
}

/** Prix unitaire en dix-millièmes : au moins 2 décimales, jusqu'à 4. */
export function formatUnitPrice(price4: number, withSymbol = true): string {
  const text = formatScaled(BigInt(price4), 4, 2);
  // Au moins deux décimales : la partie décimale est toujours présente.
  const [i, f] = text.split(".") as [string, string];
  return groupThousands(i) + "," + f + (withSymbol ? " €" : "");
}

/** Quantité en millièmes -> "12,5" */
export function formatQuantity(milli: number): string {
  const text = formatScaled(BigInt(milli), 3);
  const [i, f] = text.split(".");
  return groupThousands(i) + (f ? "," + f : "");
}

/** Points de base -> "5,5 %" */
export function formatPercent(bp: number, withSymbol = true): string {
  const text = formatScaled(BigInt(bp), 2);
  return text.replace(".", ",") + (withSymbol ? " %" : "");
}

/** Texte saisi en entier centimes -> texte décimal pour un champ de formulaire */
export function centsToInput(cents: number): string {
  return formatScaled(BigInt(cents), 2, 2).replace(".", ",");
}

export function price4ToInput(price4: number): string {
  return formatScaled(BigInt(price4), 4, 2).replace(".", ",");
}

export function milliToInput(milli: number): string {
  return formatScaled(BigInt(milli), 3).replace(".", ",");
}

export function bpToInput(bp: number): string {
  return formatScaled(BigInt(bp), 2).replace(".", ",");
}
