/**
 * Signature AWS Version 4 pour un stockage objet compatible S3 (AWS, Scaleway, OVHcloud, Clever Cloud, MinIO),
 * sans dépendance : liens signés à durée limitée et en-têtes d'autorisation des requêtes.
 */

import { createHash, createHmac } from "node:crypto";

export interface S3Config {
  /** Hôte du service, sans protocole : s3.fr-par.scw.cloud, s3.amazonaws.com... */
  host: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Adresse de la forme hôte/bucket/clé au lieu de bucket.hôte/clé (MinIO, certains hébergeurs) */
  pathStyle?: boolean;
  /** http pour un service local de test, https sinon */
  protocol?: "https" | "http";
}

const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** Encodage URI de la norme AWS : tout sauf A-Z a-z 0-9 - _ . ~, et « / » conservé dans les chemins */
export function uriEncode(s: string, keepSlash = false) {
  return [...Buffer.from(s, "utf8")]
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === "/")) return c;
      return `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

export function amzDate(now: Date) {
  const iso = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return { stamp: iso, day: iso.slice(0, 8) };
}

function signingKey(secret: string, day: string, region: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), "s3"), "aws4_request");
}

function target(c: S3Config, key: string) {
  const host = c.pathStyle ? c.host : `${c.bucket}.${c.host}`;
  const path = `${c.pathStyle ? `/${uriEncode(c.bucket)}` : ""}/${uriEncode(key, true)}`;
  return { host, path };
}

/** Lien signé valable `expiresSec` secondes (7 jours au plus), lisible sans autre authentification */
export function presignUrl(c: S3Config, key: string, opts: { method?: string; expiresSec: number; now?: Date }) {
  const { stamp, day } = amzDate(opts.now ?? new Date());
  const { host, path } = target(c, key);
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const query: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${c.accessKeyId}/${scope}`],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(Math.min(604800, Math.max(1, Math.round(opts.expiresSec))))],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const qs = query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [opts.method ?? "GET", path, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c.secretAccessKey, day, c.region))
    .update(toSign)
    .digest("hex");
  return `${c.protocol ?? "https"}://${host}${path}?${qs}&X-Amz-Signature=${signature}`;
}

/** En-têtes signés d'une requête (dépôt, lecture ou suppression d'un objet) */
export function signRequest(
  c: S3Config,
  method: string,
  key: string,
  opts: { body?: Uint8Array; headers?: Record<string, string>; now?: Date } = {},
): { url: string; headers: Record<string, string> } {
  const { stamp, day } = amzDate(opts.now ?? new Date());
  const { host, path } = target(c, key);
  const payloadHash = sha256Hex(opts.body ?? new Uint8Array());
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c.secretAccessKey, day, c.region))
    .update(toSign)
    .digest("hex");
  const { host: _h, ...sent } = headers;
  void _h;
  return {
    url: `${c.protocol ?? "https"}://${host}${path}`,
    headers: { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope},SignedHeaders=${names.join(";")},Signature=${signature}` },
  };
}
