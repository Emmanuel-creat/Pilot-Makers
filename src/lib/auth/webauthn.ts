/**
 * Vérification des clés d'accès (WebAuthn, passkeys), sans dépendance.
 *
 * Le navigateur crée une paire de clés liée au domaine de l'application : la clé privée reste dans le téléphone,
 * l'ordinateur ou le gestionnaire de mots de passe, seule la clé publique est enregistrée ici. À la connexion,
 * l'appareil signe un défi à usage unique après avoir vérifié l'utilisateur (empreinte, visage ou code de l'appareil).
 * L'attestation du fabricant n'est pas demandée : seule compte la signature du défi.
 */

import { createHash, createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";

export class WebAuthnError extends Error {}

export function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromB64url(s: unknown): Uint8Array {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new WebAuthnError("Donnée mal formée");
  return new Uint8Array(Buffer.from(s, "base64url"));
}

/* CBOR, sous-ensemble utilisé par WebAuthn ------------------------------ */

export type Cbor = number | Uint8Array | string | boolean | null | undefined | Cbor[] | Map<Cbor, Cbor>;

export function decodeCbor(data: Uint8Array, start = 0): { value: Cbor; end: number } {
  let pos = start;
  const need = (n: number) => {
    if (pos + n > data.length) throw new WebAuthnError("Donnée CBOR tronquée");
  };
  const readLength = (info: number): number => {
    if (info < 24) return info;
    const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!size) throw new WebAuthnError("Longueur CBOR non prise en charge");
    need(size);
    let n = 0;
    for (let i = 0; i < size; i++) n = n * 256 + data[pos + i];
    pos += size;
    return n;
  };
  const item = (depth: number): Cbor => {
    if (depth > 16) throw new WebAuthnError("Donnée CBOR trop imbriquée");
    need(1);
    const head = data[pos++];
    const major = head >> 5;
    const info = head & 31;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
      throw new WebAuthnError("Valeur CBOR non prise en charge");
    }
    const len = readLength(info);
    switch (major) {
      case 0:
        return len;
      case 1:
        return -1 - len;
      case 2:
      case 3: {
        need(len);
        const bytes = data.slice(pos, pos + len);
        pos += len;
        return major === 2 ? bytes : Buffer.from(bytes).toString("utf8");
      }
      case 4: {
        const out: Cbor[] = [];
        for (let i = 0; i < len; i++) out.push(item(depth + 1));
        return out;
      }
      default: {
        const map = new Map<Cbor, Cbor>();
        for (let i = 0; i < len; i++) {
          const k = item(depth + 1);
          map.set(k, item(depth + 1));
        }
        return map;
      }
    }
  };
  const value = item(0);
  return { value, end: pos };
}

/* Données de l'authentificateur ------------------------------------------ */

export interface AuthData {
  rpIdHash: Uint8Array;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  credentialId?: Uint8Array;
  publicKey?: Map<Cbor, Cbor>;
}

export function parseAuthData(a: Uint8Array): AuthData {
  if (a.length < 37) throw new WebAuthnError("Données de l'authentificateur trop courtes");
  const flags = a[32];
  const out: AuthData = {
    rpIdHash: a.slice(0, 32),
    userPresent: !!(flags & 0x01),
    userVerified: !!(flags & 0x04),
    signCount: Buffer.from(a.slice(33, 37)).readUInt32BE(0),
  };
  if (flags & 0x40) {
    if (a.length < 55) throw new WebAuthnError("Clé d'accès incomplète");
    const len = (a[53] << 8) | a[54];
    if (a.length < 55 + len) throw new WebAuthnError("Clé d'accès incomplète");
    out.credentialId = a.slice(55, 55 + len);
    const key = decodeCbor(a, 55 + len).value;
    if (!(key instanceof Map)) throw new WebAuthnError("Clé publique illisible");
    out.publicKey = key;
  }
  return out;
}

/** Clé publique COSE (ES256, RS256 ou Ed25519) convertie au format SPKI, avec son algorithme. */
export function coseToSpki(key: Map<Cbor, Cbor>): { spki: Uint8Array; alg: number } {
  const kty = key.get(1);
  const alg = key.get(3);
  const bytes = (k: number) => {
    const v = key.get(k);
    if (!(v instanceof Uint8Array)) throw new WebAuthnError("Clé publique illisible");
    return b64url(v);
  };
  let jwk: JsonWebKey;
  if (kty === 2 && alg === -7 && key.get(-1) === 1) jwk = { kty: "EC", crv: "P-256", x: bytes(-2), y: bytes(-3) };
  else if (kty === 3 && alg === -257) jwk = { kty: "RSA", n: bytes(-1), e: bytes(-2) };
  else if (kty === 1 && alg === -8 && key.get(-1) === 6) jwk = { kty: "OKP", crv: "Ed25519", x: bytes(-2) };
  else throw new WebAuthnError("Type de clé non pris en charge");
  const spki = createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "der" });
  return { spki: new Uint8Array(spki), alg };
}

/* Vérifications ------------------------------------------------------------ */

export interface Expected {
  challenge: string;
  origin: string;
  rpId: string;
}

function checkClientData(raw: Uint8Array, type: string, exp: Expected) {
  let c: { type?: unknown; challenge?: unknown; origin?: unknown; crossOrigin?: unknown };
  try {
    c = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    throw new WebAuthnError("Réponse du navigateur illisible");
  }
  if (c.type !== type) throw new WebAuthnError("Réponse du navigateur inattendue");
  if (c.challenge !== exp.challenge) throw new WebAuthnError("Défi expiré ou déjà utilisé");
  if (c.origin !== exp.origin || c.crossOrigin === true) throw new WebAuthnError("Clé d'accès présentée depuis un autre site");
}

function checkAuthData(a: AuthData, exp: Expected) {
  if (!Buffer.from(a.rpIdHash).equals(createHash("sha256").update(exp.rpId).digest())) throw new WebAuthnError("Clé d'accès d'un autre site");
  if (!a.userPresent || !a.userVerified) throw new WebAuthnError("L'appareil n'a pas vérifié l'utilisateur");
}

/** Enregistrement d'une nouvelle clé : renvoie l'identifiant et la clé publique à conserver. */
export function verifyRegistration(response: { clientDataJSON?: unknown; attestationObject?: unknown }, exp: Expected) {
  checkClientData(fromB64url(response.clientDataJSON), "webauthn.create", exp);
  const att = decodeCbor(fromB64url(response.attestationObject)).value;
  if (!(att instanceof Map)) throw new WebAuthnError("Attestation illisible");
  const authData = att.get("authData");
  if (!(authData instanceof Uint8Array)) throw new WebAuthnError("Attestation illisible");
  const a = parseAuthData(authData);
  checkAuthData(a, exp);
  if (!a.credentialId || !a.publicKey) throw new WebAuthnError("Clé d'accès incomplète");
  const { spki, alg } = coseToSpki(a.publicKey);
  return { credentialId: b64url(a.credentialId), publicKey: spki, alg, signCount: a.signCount };
}

/** Connexion : la signature du défi par la clé enregistrée. Renvoie le nouveau compteur de signatures. */
export function verifyAssertion(
  response: { clientDataJSON?: unknown; authenticatorData?: unknown; signature?: unknown },
  exp: Expected,
  stored: { publicKey: Uint8Array; alg: number; signCount: number },
) {
  const clientData = fromB64url(response.clientDataJSON);
  checkClientData(clientData, "webauthn.get", exp);
  const authData = fromB64url(response.authenticatorData);
  const a = parseAuthData(authData);
  checkAuthData(a, exp);
  const signed = Buffer.concat([authData, createHash("sha256").update(clientData).digest()]);
  const key = createPublicKey({ key: Buffer.from(stored.publicKey), format: "der", type: "spki" });
  const ok = verifySignature(stored.alg === -8 ? null : "sha256", signed, key, fromB64url(response.signature));
  if (!ok) throw new WebAuthnError("Signature de la clé d'accès invalide");
  // Un compteur qui recule trahit une clé copiée ; les appareils qui ne comptent pas envoient toujours 0.
  if ((a.signCount || stored.signCount) && a.signCount <= stored.signCount) throw new WebAuthnError("Clé d'accès dupliquée détectée");
  return { signCount: a.signCount };
}

/** Domaine et origine attendus, tirés de APP_URL. */
export function relyingParty(appUrl = process.env.APP_URL ?? "http://localhost:3000") {
  const u = new URL(appUrl);
  return { rpId: u.hostname, origin: u.origin, name: "Pilot-Makers" };
}
