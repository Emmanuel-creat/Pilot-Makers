/**
 * Coffre chiffré : les pièces confidentielles sont chiffrées dans le navigateur (AES-GCM 256, clé dérivée de la
 * phrase secrète par PBKDF2) avant l'envoi. Le serveur ne reçoit ni la phrase ni le contenu en clair, ni le nom du fichier.
 * Les mêmes fonctions servent au navigateur et aux tests (Web Crypto).
 */

export const VAULT_ITERATIONS = 310_000;
export const VAULT_MAX_BYTES = 10 * 1024 * 1024;
export const VAULT_MIN_PASSPHRASE = 12;

export interface VaultEnvelope {
  /** Sel de la dérivation, base64 (16 octets) */
  salt: string;
  /** Vecteur d'initialisation du contenu, base64 (12 octets) */
  iv: string;
  /** Vecteur d'initialisation du nom, base64 (12 octets) */
  nameIv: string;
  /** Type et nom du fichier (« type|nom »), chiffrés, base64 */
  name: string;
}

export const toB64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const subtle = () => globalThis.crypto.subtle;
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>;

export function passphraseIssue(p: string): string | null {
  if (p.length < VAULT_MIN_PASSPHRASE) return `Phrase secrète trop courte (${VAULT_MIN_PASSPHRASE} caractères au moins)`;
  if (new Set(p).size < 6) return "Phrase secrète trop simple : variez les caractères";
  return null;
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt: buf(salt), iterations: VAULT_ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Chiffre un fichier : enveloppe (sel, vecteurs, nom chiffré) et contenu chiffré à envoyer. */
export async function sealFile(passphrase: string, file: { name: string; type: string; bytes: Uint8Array }) {
  const salt = random(16);
  const iv = random(12);
  const nameIv = random(12);
  const key = await deriveKey(passphrase, salt);
  const cipher = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(file.bytes)));
  const label = new TextEncoder().encode(`${file.type || "application/octet-stream"}|${file.name.slice(0, 200)}`);
  const name = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(nameIv) }, key, buf(label)));
  const envelope: VaultEnvelope = { salt: toB64(salt), iv: toB64(iv), nameIv: toB64(nameIv), name: toB64(name) };
  return { envelope, cipher };
}

/** Nom et type du fichier ; null si la phrase secrète ne correspond pas. */
export async function openName(passphrase: string, e: VaultEnvelope): Promise<{ name: string; type: string } | null> {
  try {
    const key = await deriveKey(passphrase, fromB64(e.salt));
    const plain = new TextDecoder().decode(await subtle().decrypt({ name: "AES-GCM", iv: buf(fromB64(e.nameIv)) }, key, buf(fromB64(e.name))));
    const at = plain.indexOf("|");
    return { type: plain.slice(0, at), name: plain.slice(at + 1) };
  } catch {
    return null;
  }
}

/** Contenu en clair ; null si la phrase secrète ne correspond pas ou si le fichier a été modifié. */
export async function openFile(passphrase: string, e: VaultEnvelope, cipher: Uint8Array): Promise<Uint8Array | null> {
  try {
    const key = await deriveKey(passphrase, fromB64(e.salt));
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(fromB64(e.iv)) }, key, buf(cipher)));
  } catch {
    return null;
  }
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Contrôle côté serveur de l'enveloppe reçue : formats et tailles seulement, le contenu reste illisible. */
export function envelopeIssue(e: unknown): string | null {
  if (!e || typeof e !== "object") return "Enveloppe manquante";
  const v = e as Record<string, unknown>;
  const len = (k: string) => {
    try {
      return typeof v[k] === "string" && B64.test(v[k] as string) ? fromB64(v[k] as string).length : -1;
    } catch {
      return -1;
    }
  };
  if (len("salt") !== 16) return "Sel invalide";
  if (len("iv") !== 12 || len("nameIv") !== 12) return "Vecteur d'initialisation invalide";
  const n = len("name");
  if (n < 17 || n > 600) return "Nom chiffré invalide";
  return null;
}
