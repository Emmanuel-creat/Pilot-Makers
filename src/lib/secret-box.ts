/**
 * Chiffrement des données sensibles au repos (AES-256-GCM).
 *
 * La clé est dérivée de APP_SECRET. En production, l'absence de ce secret est
 * une erreur : sans lui, les données chiffrées ne pourraient plus être relues.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_SECRET = "pilot-makers-secret-de-developpement";

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET doit être défini en production");
    return createHash("sha256").update(DEV_SECRET).digest();
  }
  return createHash("sha256").update(secret).digest();
}

/** Renvoie "v1.<iv>.<tag>.<données>" en base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("Donnée chiffrée illisible");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("v1.");
}
