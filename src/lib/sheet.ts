/**
 * Lecture de tableaux importés : CSV (UTF-8 ou Windows-1252, encodage d'Excel en France),
 * classeurs Excel .xlsx et LibreOffice .ods. Seule la première feuille est lue.
 */

import { parseCsv } from "./csv";
import { unzip } from "./zip";

export class SheetError extends Error {}

const MAX_ROWS = 5001;
const MAX_COLS = 200;

/** Caractères Windows-1252 de 0x80 à 0x9F (le reste correspond à Latin-1). */
const CP1252 =
  "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let out = "";
    for (const b of bytes) out += b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b);
    return out;
  }
}

function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "amp") return "&";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  });
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? xmlText(m[1]) : undefined;
}

/** Nombre lisible : les flottants d'Excel (12.499999999) sont arrondis à 6 décimales. */
function plainNumber(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Numéro de série Excel (jours depuis le 30/12/1899) en date AAAA-MM-JJ. */
export function excelDate(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
}

function trimTable(rows: string[][]): string[][] {
  const out = rows.map((r) => {
    let end = r.length;
    while (end > 0 && !r[end - 1]) end--;
    return r.slice(0, end);
  });
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out;
}

function readXlsx(files: Map<string, Buffer>): string[][] {
  const get = (n: string) => files.get(n)?.toString("utf8");
  const workbook = get("xl/workbook.xml");
  if (!workbook) throw new SheetError("Classeur Excel illisible");
  const firstRid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = get("xl/_rels/workbook.xml.rels") ?? "";
  let target = "worksheets/sheet1.xml";
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    if (attr(m[1], "Id") === firstRid) target = attr(m[1], "Target") ?? target;
  }
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheet = get(path);
  if (!sheet) throw new SheetError("Feuille introuvable dans le classeur");

  const shared: string[] = [];
  for (const si of (get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const body = si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    shared.push([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(""));
  }

  // Styles de date : formats intégrés 14 à 22 et formats personnalisés contenant jour ou année.
  const styles = get("xl/styles.xml") ?? "";
  const dateFormats = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  for (const f of styles.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const code = (attr(f[1], "formatCode") ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
    if (/[dy]/i.test(code)) dateFormats.add(Number(attr(f[1], "numFmtId")));
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const dateStyle = [...xfs.matchAll(/<xf\b([^>]*)\/?>/g)].map((x) => dateFormats.has(Number(attr(x[1], "numFmtId"))));

  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = Number(attr(r[1], "r")) || rows.length + 1;
    if (rowNum > MAX_ROWS) throw new SheetError("5 000 lignes maximum par import");
    const row: string[] = [];
    let col = 0;
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      if (ref) col = columnIndex(ref);
      if (col >= MAX_COLS) break;
      const type = attr(c[1], "t") ?? "n";
      const inner = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let text = "";
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join("");
      else if (type === "b") text = v === "1" ? "oui" : "non";
      else if (type === "str") text = v !== undefined ? xmlText(v) : "";
      else if (type === "e") text = "";
      else if (v !== undefined) text = dateStyle[Number(attr(c[1], "s") ?? 0)] ? excelDate(Number(v)) : plainNumber(v);
      row[col] = text;
      col++;
    }
    while (rows.length < rowNum - 1) rows.push([]);
    rows[rowNum - 1] = Array.from(row, (x) => x ?? "");
  }
  return trimTable(rows);
}

function readOds(files: Map<string, Buffer>): string[][] {
  const content = files.get("content.xml")?.toString("utf8");
  if (!content) throw new SheetError("Classeur OpenDocument illisible");
  const table = /<table:table\b[^>]*>([\s\S]*?)<\/table:table>/.exec(content)?.[1] ?? "";
  const rows: string[][] = [];
  for (const r of table.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
    const row: string[] = [];
    for (const c of (r[2] ?? "").matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
      const a = c[1];
      const type = attr(a, "office:value-type");
      let text = "";
      if (type === "float" || type === "percentage" || type === "currency") text = plainNumber(attr(a, "office:value") ?? "");
      else if (type === "date") text = (attr(a, "office:date-value") ?? "").slice(0, 10);
      else if (type === "boolean") text = attr(a, "office:boolean-value") === "true" ? "oui" : "non";
      else
        text = [...(c[2] ?? "").matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)]
          .map((p) =>
            xmlText(
              p[1]
                .replace(/<text:s\b([^>]*)\/>/g, (_m, sa: string) => " ".repeat(Math.min(Number(attr(sa, "text:c") ?? 1), 100)))
                .replace(/<text:line-break\s*\/>/g, "\n")
                .replace(/<[^>]+>/g, ""),
            ),
          )
          .join("\n");
      // Les cellules vides répétées (fin de ligne) ne sont pas recopiées.
      const repeat = Math.min(Number(attr(a, "table:number-columns-repeated") ?? 1), text ? MAX_COLS : 1);
      for (let i = 0; i < repeat && row.length < MAX_COLS; i++) row.push(text);
    }
    const repeatRows = Number(attr(r[1], "table:number-rows-repeated") ?? 1);
    const empty = row.every((x) => !x);
    for (let i = 0; i < (empty ? 1 : Math.min(repeatRows, MAX_ROWS)); i++) rows.push(row);
    if (rows.length > MAX_ROWS) throw new SheetError("5 000 lignes maximum par import");
  }
  return trimTable(rows);
}

/** Lit un fichier importé (CSV, Excel ou LibreOffice) et renvoie ses lignes. */
export function readTable(bytes: Uint8Array, name = ""): string[][] {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new SheetError("L'ancien format Excel .xls n'est pas pris en charge : enregistrez le fichier au format .xlsx ou .csv");
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    let files: Map<string, Buffer>;
    try {
      files = unzip(Buffer.from(bytes), { maxBytes: 60_000_000 });
    } catch (e) {
      throw new SheetError(`Classeur illisible : ${(e as Error).message}`);
    }
    if (files.has("xl/workbook.xml")) return readXlsx(files);
    if (files.get("mimetype")?.toString("utf8").startsWith("application/vnd.oasis.opendocument.spreadsheet")) return readOds(files);
    throw new SheetError("Format de classeur non reconnu : utilisez .xlsx, .ods ou .csv");
  }
  if (/\.(pdf|docx?|odt)$/i.test(name)) throw new SheetError("Seuls les fichiers .csv, .xlsx et .ods peuvent être importés");
  const rows = parseCsv(decodeText(bytes));
  if (rows.length > MAX_ROWS) throw new SheetError("5 000 lignes maximum par import");
  return trimTable(rows);
}

/** En-tête simplifiée pour la reconnaissance des colonnes : minuscules, sans accent ni ponctuation. */
export function headerKey(h: string): string {
  return h
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Nombre saisi dans un tableur, nettoyé : symboles monétaires et de pourcentage retirés,
 * séparateurs de milliers acceptés, arrondi à `scale` décimales.
 */
export function cleanAmount(raw: string, scale: number): string {
  let s = raw.replace(/[\s\u00a0\u202f€%]|EUR/gi, "");
  // Symboles restants autour du nombre (devise mal encodée, unité) : ignorés s'il reste un nombre.
  if (/\d/.test(s)) s = s.replace(/^[^\d+\-.,]+|[^\d.,]+$/g, "");
  if (!s) return "";
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (!/^[+-]?\d*\.?\d*$/.test(s) || s === "." || s === "") return raw.trim();
  const n = Number(s);
  const [, frac = ""] = s.split(".");
  if (frac.length <= scale) return s;
  return (Math.round(n * 10 ** scale) / 10 ** scale).toFixed(scale);
}
