/** Réseaux d'artisans : code d'invitation et règles de partage des ouvrages. */

import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MAX_NETWORKS = 10;
export const MAX_SHARED = 500;

/** Code d'invitation lisible, sans caractères ambigus (0/O, 1/I/L). */
export function makeJoinCode(rand: (n: number) => number = randomInt): string {
  let c = "";
  for (let i = 0; i < 8; i++) c += ALPHABET[rand(ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

export function normalizeJoinCode(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : "";
}
