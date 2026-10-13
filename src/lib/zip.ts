/**
 * Écriture d'archives ZIP (format ouvert, lisible par tous les systèmes) sans dépendance :
 * compression « deflate », noms de fichiers en UTF-8, pas de ZIP64 (archives de moins de 4 Go).
 */

import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
  date?: Date;
}

function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

export function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    const name = e.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name || name.split("/").includes("..") || seen.has(name)) throw new Error(`Nom de fichier invalide dans l'archive : ${e.name}`);
    seen.add(name);
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : Buffer.from(e.data);
    const deflated = deflateRawSync(raw);
    // Les fichiers déjà compressés (photos, PDF) sont stockés tels quels si la compression n'apporte rien.
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const crc = crc32(raw) >>> 0;
    const fname = Buffer.from(name, "utf8");
    const [time, date] = dosDateTime(e.date ?? new Date());
    const method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(fname.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(fname.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fname, body);
    centrals.push(central, fname);
    offset += local.length + fname.length + body.length;
    if (offset > 0xffffffff) throw new Error("Archive trop volumineuse");
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Lecture d'une archive produite par zip() (contrôles et tests). */
export function unzip(buf: Buffer, opts: { maxBytes?: number } = {}): Map<string, Buffer> {
  const maxBytes = opts.maxBytes ?? 200_000_000;
  let total = 0;
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error("Archive ZIP illisible");
  const count = buf.readUInt16LE(endAt + 10);
  let p = buf.readUInt32LE(endAt + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Répertoire central invalide");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`Méthode de compression non prise en charge : ${name}`);
    // Protection contre les archives piégées : la taille décompressée est plafonnée.
    const data = method === 8 ? inflateRawSync(body, { maxOutputLength: Math.max(1, maxBytes - total) }) : Buffer.from(body);
    total += data.length;
    if (total > maxBytes) throw new Error("Archive trop volumineuse une fois décompressée");
    if (crc32(data) >>> 0 !== crc) throw new Error(`Contrôle d'intégrité en échec : ${name}`);
    out.set(name, data);
    p += 46 + nameLen + extra;
  }
  return out;
}
