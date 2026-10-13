/**
 * Analyse des fichiers déposés (photos, PDF, justificatifs), avant tout enregistrement.
 *
 * Deux niveaux :
 * - contrôles intégrés, toujours actifs : fichier de test EICAR, PDF à contenu actif (JavaScript, lancement
 *   de programme, fichier exécutable joint, contenu multimédia), image qui cache du code (HTML, script, PHP) ;
 * - moteur antivirus ClamAV quand CLAMD_HOST est défini (port CLAMD_PORT, 3310 par défaut), interrogé par le
 *   protocole INSTREAM. S'il ne répond pas, le dépôt est accepté avec une alerte à l'exploitation, sauf si
 *   CLAMD_REQUIRED=1 : il est alors refusé.
 */

import { connect } from "node:net";
import { inflateSync } from "node:zlib";
import { badRequest, HttpError } from "@/lib/http";
import { sendAlert } from "@/lib/monitoring";

export type ScanResult = { clean: true; engine: string } | { clean: false; engine: string; threat: string };

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/** Recherche d'un motif dans les octets lus comme du texte latin-1. */
function contains(bytes: Uint8Array, pattern: RegExp) {
  return pattern.test(Buffer.from(bytes).toString("latin1"));
}

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const isImage = (b: Uint8Array) =>
  (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46);

/**
 * Texte du PDF à analyser : le fichier brut et ses flux décompressés, car les dictionnaires
 * (dont les actions JavaScript) peuvent être rangés dans des flux d'objets compressés.
 */
export function pdfScanText(bytes: Uint8Array, maxBytes = 40_000_000): string {
  const raw = Buffer.from(bytes);
  const parts = [raw.toString("latin1")];
  let total = 0;
  let from = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const start = raw.indexOf("stream", from, "latin1");
    if (start < 0) break;
    let body = start + 6;
    if (raw[body] === 0x0d) body++;
    if (raw[body] === 0x0a) body++;
    const end = raw.indexOf("endstream", body, "latin1");
    if (end < 0) break;
    from = end + 9;
    if (raw.subarray(start - 3, start).toString("latin1") === "end") continue;
    try {
      const out = inflateSync(raw.subarray(body, end), { maxOutputLength: 10_000_000 });
      total += out.length;
      if (total > maxBytes) break;
      parts.push(out.toString("latin1"));
    } catch {
      // Flux non compressé, compressé autrement (images) ou abîmé : déjà lu dans le fichier brut.
    }
  }
  return parts.join("\n");
}

/** Contrôles intégrés. */
export function builtInScan(bytes: Uint8Array): ScanResult {
  const engine = "contrôles intégrés";
  if (Buffer.from(bytes).includes(EICAR)) return { clean: false, engine, threat: "fichier de test antivirus EICAR" };
  if (contains(bytes.subarray(0, 2), /^MZ$/) || contains(bytes.subarray(0, 4), /^\x7fELF$/)) return { clean: false, engine, threat: "programme exécutable" };
  if (isPdf(bytes)) {
    const text = pdfScanText(bytes);
    const has = (re: RegExp) => re.test(text);
    // « /JS » seul est court : exigé suivi d'une chaîne ou d'une référence, pour ne pas le trouver par hasard dans un flux compressé.
    if (has(/\/JavaScript\b|\/JS\s*(\(|<|\d+\s+\d+\s+R)/)) return { clean: false, engine, threat: "PDF contenant du JavaScript" };
    if (has(/\/Launch\b/)) return { clean: false, engine, threat: "PDF qui lance un programme" };
    if (has(/\/RichMedia\b/)) return { clean: false, engine, threat: "PDF à contenu multimédia actif" };
    // Une facture électronique Factur-X ou ZUGFeRD joint un fichier XML : seul ce cas est accepté.
    if (has(/\/EmbeddedFiles?\b/) && !has(/(factur-x|zugferd-invoice|xrechnung|order-x)\.xml/i)) {
      return { clean: false, engine, threat: "PDF contenant un fichier joint" };
    }
  }
  if (isImage(bytes) && contains(bytes, /<script\b|<html\b|<iframe\b|<\?php/i)) return { clean: false, engine, threat: "image contenant du code" };
  return { clean: true, engine };
}

/** Interroge ClamAV (clamd) par le protocole INSTREAM. */
export function clamdScan(bytes: Uint8Array, host: string, port: number, timeoutMs = 10_000): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let answer = "";
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error("ClamAV ne répond pas")));
    socket.on("error", reject);
    socket.on("data", (d) => (answer += d.toString("latin1")));
    socket.on("close", () => {
      const text = answer.replace(/\0/g, "").trim();
      if (/:\s*OK$/.test(text)) resolve({ clean: true, engine: "ClamAV" });
      else if (/FOUND$/.test(text)) resolve({ clean: false, engine: "ClamAV", threat: text.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, "") });
      else reject(new Error(`Réponse ClamAV inattendue : ${text.slice(0, 120) || "vide"}`));
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const chunk = 64 * 1024;
      for (let i = 0; i < bytes.length; i += chunk) {
        const part = bytes.subarray(i, i + chunk);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

/** Analyse complète : contrôles intégrés puis ClamAV s'il est configuré. */
export async function scanFile(bytes: Uint8Array, env: Record<string, string | undefined> = process.env): Promise<ScanResult> {
  const local = builtInScan(bytes);
  if (!local.clean || !env.CLAMD_HOST) return local;
  try {
    return await clamdScan(bytes, env.CLAMD_HOST, Number(env.CLAMD_PORT ?? 3310));
  } catch (e) {
    if (env.CLAMD_REQUIRED === "1") throw new HttpError(503, "scan_unavailable", "Analyse antivirus indisponible : réessayez dans quelques minutes.");
    await sendAlert(`Pilot-Makers : analyse antivirus indisponible, fichier accepté après les seuls contrôles intégrés (${(e as Error).message}).`);
    return local;
  }
}

/** Refuse le dépôt d'un fichier suspect, avec un message compréhensible. */
export async function requireCleanFile(bytes: Uint8Array, onThreat?: (r: { engine: string; threat: string }) => Promise<void>) {
  const r = await scanFile(bytes);
  if (!r.clean) {
    if (onThreat) await onThreat(r);
    throw badRequest(`Fichier refusé par l'analyse de sécurité (${r.threat}). Enregistrez-le de nouveau depuis sa source ou envoyez une photo.`);
  }
}
