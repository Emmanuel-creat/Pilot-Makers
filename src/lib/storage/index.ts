/**
 * Stockage des fichiers (logos, photos, PDF) : en base par défaut, ou dans un stockage objet compatible S3 dès que
 * STORAGE_DRIVER=s3 est configuré. Dans les deux cas, un fichier se lit par un lien signé à durée limitée.
 */

import { one, type Queryable } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { hmacSha256, safeEqual } from "@/lib/security";
import { appUrl } from "@/lib/services/mail";
import { presignUrl, signRequest, type S3Config } from "./sigv4";

export interface StoredFile {
  bytes: Uint8Array;
  contentType: string;
}

export interface FileStore {
  driver: "db" | "s3";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  remove(key: string): Promise<void>;
  /** Lien de lecture valable `ttlSec` secondes */
  signedUrl(key: string, ttlSec: number, now?: Date): string;
}

/** Clé de fichier : segments séparés par « / », sans remontée de dossier */
export function checkKey(key: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(key) || key.length > 300 || key.includes(".."))
    throw badRequest("Nom de fichier invalide");
  return key;
}

const secret = () => process.env.APP_SECRET ?? "pilot-makers-secret-de-developpement";
const linkSignature = (key: string, exp: number) => hmacSha256(secret(), `fichier:${key}:${exp}`);

/** Lien signé vers un fichier rangé en base, servi par /api/fichiers */
export function dbFileLink(key: string, ttlSec: number, now = new Date()) {
  const exp = Math.floor(now.getTime() / 1000) + Math.max(1, Math.round(ttlSec));
  return appUrl(`/api/fichiers/${checkKey(key)}?exp=${exp}&sig=${linkSignature(key, exp)}`);
}

export function verifyFileLink(key: string, exp: string | null, sig: string | null, now = new Date()) {
  const e = Number(exp);
  if (!Number.isInteger(e) || !sig || e < Math.floor(now.getTime() / 1000)) return false;
  return safeEqual(linkSignature(key, e), sig);
}

export function dbStore(db: Queryable): FileStore {
  return {
    driver: "db",
    async put(key, bytes, contentType) {
      await db.query(
        `INSERT INTO stored_files (key, content_type, size, data) VALUES ($1,$2,$3,$4)
         ON CONFLICT (key) DO UPDATE SET content_type=EXCLUDED.content_type, size=EXCLUDED.size, data=EXCLUDED.data, created_at=now()`,
        [checkKey(key), contentType, bytes.length, bytes],
      );
    },
    async get(key) {
      const r = await one<{ data: Uint8Array; content_type: string }>(db, "SELECT data, content_type FROM stored_files WHERE key=$1", [checkKey(key)]);
      return r ? { bytes: new Uint8Array(r.data), contentType: r.content_type } : null;
    },
    async remove(key) {
      await db.query("DELETE FROM stored_files WHERE key=$1", [checkKey(key)]);
    },
    signedUrl: (key, ttlSec, now) => dbFileLink(key, ttlSec, now),
  };
}

export function s3Store(c: S3Config, fetcher: typeof fetch = fetch): FileStore {
  const send = async (method: string, key: string, body?: Uint8Array, headers?: Record<string, string>) => {
    const r = signRequest(c, method, checkKey(key), { body, headers });
    return fetcher(r.url, { method, headers: r.headers, body: body ? Buffer.from(body) : undefined });
  };
  return {
    driver: "s3",
    async put(key, bytes, contentType) {
      const res = await send("PUT", key, bytes, { "content-type": contentType });
      if (!res.ok) throw new Error(`Stockage objet : dépôt refusé (${res.status})`);
    },
    async get(key) {
      const res = await send("GET", key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Stockage objet : lecture refusée (${res.status})`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    },
    async remove(key) {
      const res = await send("DELETE", key);
      if (!res.ok && res.status !== 404) throw new Error(`Stockage objet : suppression refusée (${res.status})`);
    },
    signedUrl: (key, ttlSec, now) => presignUrl(c, checkKey(key), { expiresSec: ttlSec, now }),
  };
}

/** Configuration S3 lue dans l'environnement ; null si le stockage objet n'est pas choisi */
export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3Config | null {
  if (env.STORAGE_DRIVER !== "s3") return null;
  const need = ["S3_HOST", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Stockage objet : variables manquantes ${missing.join(", ")}`);
  return {
    host: env.S3_HOST!,
    region: env.S3_REGION!,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    pathStyle: env.S3_PATH_STYLE === "1",
    protocol: env.S3_PROTOCOL === "http" ? "http" : "https",
  };
}

export function fileStore(db: Queryable): FileStore {
  const c = s3ConfigFromEnv();
  return c ? s3Store(c) : dbStore(db);
}
