/**
 * Retrait des métadonnées d'une photo avant publication : position GPS, appareil, date et commentaires
 * (EXIF, XMP, IPTC). Les pixels ne sont pas modifiés. JPEG, PNG et WebP ; tout autre contenu est refusé.
 */

export class ImageFormatError extends Error {}

function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new ImageFormatError("JPEG illisible");
    const marker = b[i + 1];
    // Début des données d'image : le reste est recopié tel quel.
    if (marker === 0xda) {
      out.push(b.subarray(i));
      return concat(out);
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) throw new ImageFormatError("JPEG illisible");
    // APP1 (EXIF, XMP), APP13 (IPTC) et commentaires retirés ; APP0 (JFIF), APP2 (profil couleur) et APP14 gardés.
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe || (marker >= 0xe3 && marker <= 0xec);
    if (!drop) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new ImageFormatError("JPEG incomplet");
}

const PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);

function stripPng(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (end > b.length) throw new ImageFormatError("PNG illisible");
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(out);
  }
  throw new ImageFormatError("PNG incomplet");
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | ((b[i + 7] << 24) >>> 0);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > b.length) throw new ImageFormatError("WebP illisible");
    if (type !== "EXIF" && type !== "XMP ") {
      const c = b.slice(i, Math.min(end, b.length));
      // Indicateurs EXIF (bit 3) et XMP (bit 2) de l'en-tête étendu remis à zéro.
      if (type === "VP8X") c[8] &= ~0x0c;
      chunks.push(c);
    }
    i = end;
  }
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const size = body.length + 4;
  head[4] = size & 0xff;
  head[5] = (size >> 8) & 0xff;
  head[6] = (size >> 16) & 0xff;
  head[7] = (size >>> 24) & 0xff;
  return concat([head, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function stripImageMetadata(bytes: Uint8Array, type: string): Uint8Array {
  if (type === "image/jpeg") return stripJpeg(bytes);
  if (type === "image/png") return stripPng(bytes);
  if (type === "image/webp") return stripWebp(bytes);
  throw new ImageFormatError("Format d'image non pris en charge");
}
