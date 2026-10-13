/**
 * Notifications sur le téléphone (Web Push), sans dépendance.
 *
 * Le navigateur s'abonne auprès de son service de notifications (Google, Apple, Mozilla) et nous confie une adresse
 * d'envoi et deux clés. Chaque message est chiffré pour ce seul appareil (RFC 8291, aes128gcm) et signé par la clé
 * VAPID du serveur (RFC 8292) : le service de notifications ne peut pas le lire.
 */

import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type KeyObject } from "node:crypto";

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  /** Clé publique P-256 non compressée, en base64url : donnée au navigateur (applicationServerKey). */
  publicKey: string;
  /** Clé privée (scalaire de 32 octets), en base64url */
  privateKey: string;
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function vapidPrivateKey(keys: VapidKeys): KeyObject {
  const pub = fromB64u(keys.publicKey);
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
}

/** En-tête Authorization VAPID : jeton signé valable 12 heures pour le service de notifications visé. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()) {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: vapidPrivateKey(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) => Buffer.from(hkdfSync("sha256", ikm, salt, info, length));

/** Chiffre le message pour l'appareil abonné (un seul enregistrement aes128gcm). */
export function encryptPayload(sub: Pick<PushSubscription, "p256dh" | "auth">, payload: string, salt: Uint8Array = randomBytes(16)) {
  const ephemeral = createECDH("prime256v1");
  ephemeral.generateKeys();
  const uaPublic = fromB64u(sub.p256dh);
  const asPublic = ephemeral.getPublicKey();
  const shared = ephemeral.computeSecret(uaPublic);
  const ikm = hkdf(fromB64u(sub.auth), shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export type PushOutcome = "sent" | "gone" | "retry" | "rejected";

/** Envoie une notification. « gone » : l'abonnement n'existe plus et doit être supprimé. */
export async function sendPush(
  sub: PushSubscription,
  message: { title: string; body: string; url?: string },
  keys: VapidKeys,
  opts: { subject?: string; fetchImpl?: typeof fetch; ttl?: number } = {},
): Promise<{ outcome: PushOutcome; status: number }> {
  const body = encryptPayload(sub, JSON.stringify(message).slice(0, 3000));
  const res = await (opts.fetchImpl ?? fetch)(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: vapidAuthorization(sub.endpoint, keys, opts.subject ?? "mailto:contact@pilot-makers.fr"),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(opts.ttl ?? 24 * 3600),
      urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const status = res.status;
  if (status >= 200 && status < 300) return { outcome: "sent", status };
  if (status === 404 || status === 410) return { outcome: "gone", status };
  if (status === 429 || status >= 500) return { outcome: "retry", status };
  return { outcome: "rejected", status };
}
