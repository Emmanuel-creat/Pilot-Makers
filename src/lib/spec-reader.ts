/**
 * Lecture d'un cahier des charges (CCTP) pour préparer le devis : texte extrait du document (Word .docx,
 * OpenDocument .odt, texte, PDF non scanné), puis lots, articles numérotés, quantités citées et références
 * normatives (DTU, normes NF) repérés. Le résultat est une proposition à relire, jamais un devis prêt à envoyer.
 */

import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream, PDFStream } from "pdf-lib";
import { unzip } from "./zip";

export class SpecError extends Error {}

export interface SpecParagraph {
  text: string;
  /** Niveau de titre déclaré par le document (1 pour un titre principal), 0 pour un paragraphe */
  heading: number;
}

const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (named[k]) return named[k];
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  });

const clean = (s: string) =>
  s
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Paragraphes d'un document Word : texte des runs, niveau de titre d'après le style (Titre1, Heading2...). */
export function docxParagraphs(xml: string): SpecParagraph[] {
  const out: SpecParagraph[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const text = clean(decodeXml([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((t) => (t[1] === undefined ? " " : t[1])).join("")));
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const level = /^(?:heading|titre|title)\s*(\d)$/i.exec(
      style
        .replace(/[^a-z0-9]/gi, " ")
        .trim()
        .replace(/\s+/, " "),
    )?.[1];
    const outline = /<w:outlineLvl w:val="(\d)"/.exec(p)?.[1];
    out.push({ text, heading: level ? Number(level) : outline ? Number(outline) + 1 : 0 });
  }
  return out;
}

export function odtParagraphs(xml: string): SpecParagraph[] {
  const out: SpecParagraph[] = [];
  for (const m of xml.matchAll(/<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/g)) {
    const text = clean(decodeXml(m[3].replace(/<text:tab\/>|<text:s[^>]*\/>/g, " ").replace(/<[^>]+>/g, "")));
    if (!text) continue;
    const level = m[1] === "h" ? Number(/text:outline-level="(\d)"/.exec(m[2])?.[1] ?? 1) : 0;
    out.push({ text, heading: level });
  }
  return out;
}

export function textParagraphs(text: string): SpecParagraph[] {
  return text
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean)
    .map((t) => ({ text: t, heading: 0 }));
}

/** Chaîne hexadécimale d'un flux PDF, lue octet par octet (polices simples en codage Windows) */
function hexString(hex: string): string {
  const h = hex.replace(/[^0-9a-f]/gi, "");
  let s = "";
  for (let k = 0; k + 1 < h.length; k += 2) s += String.fromCharCode(parseInt(h.slice(k, k + 2), 16));
  return s;
}

/** Texte d'un flux de contenu PDF : chaînes affichées par Tj, TJ, ' et ", retour à la ligne aux déplacements. */
export function pdfContentText(content: string): string {
  let out = "";
  let i = 0;
  const pending: string[] = [];
  const readString = () => {
    let depth = 1;
    let s = "";
    i++;
    while (i < content.length && depth > 0) {
      const c = content[i];
      if (c === "\\") {
        const n = content[i + 1];
        const oct = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));
        if (oct) {
          s += String.fromCharCode(parseInt(oct[0], 8));
          i += 1 + oct[0].length;
          continue;
        }
        s += ({ n: "\n", r: "", t: " ", b: "", f: "" } as Record<string, string>)[n] ?? n;
        i += 2;
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (depth > 0) s += c;
      i++;
    }
    return s;
  };
  while (i < content.length) {
    const c = content[i];
    if (c === "(") {
      pending.push(readString());
      continue;
    }
    if (c === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i);
      if (end < 0) break;
      pending.push(hexString(content.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    if (c === "<" || c === ">") {
      i += 2;
      continue;
    }
    if (c === "[") {
      i++;
      let s = "";
      while (i < content.length && content[i] !== "]") {
        if (content[i] === "(") s += readString();
        else if (content[i] === "<") {
          const end = content.indexOf(">", i);
          s += hexString(content.slice(i + 1, end < 0 ? content.length : end));
          i = end < 0 ? content.length : end + 1;
        } else {
          const num = /^-?\d+(\.\d+)?/.exec(content.slice(i, i + 12));
          if (num) {
            if (Number(num[0]) < -200) s += " ";
            i += num[0].length;
          } else i++;
        }
      }
      i++;
      pending.push(s);
      continue;
    }
    const op = /^[A-Za-z'"*]+/.exec(content.slice(i, i + 4));
    if (op) {
      const o = op[0];
      if (o === "Tj" || o === "TJ") out += pending.join("");
      else if (o === "'" || o === '"') out += "\n" + pending.join("");
      else if (o === "Td" || o === "TD" || o === "T*" || o === "ET" || o === "Tm") out += "\n";
      pending.length = 0;
      i += o.length;
      continue;
    }
    i++;
  }
  return out;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false });
  } catch {
    throw new SpecError("PDF illisible");
  }
  let text = "";
  for (const page of doc.getPages()) {
    const contents = page.node.lookup(PDFName.of("Contents"));
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
    for (const s of streams) {
      if (!(s instanceof PDFStream)) continue;
      try {
        const raw = s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents();
        text += pdfContentText(Buffer.from(raw).toString("latin1")) + "\n";
      } catch {
        // Flux compressé autrement : ignoré.
      }
    }
  }
  return text;
}

/** Paragraphes du document selon son format ; refuse un PDF scanné ou dont les polices ne sont pas lisibles. */
export async function specParagraphs(bytes: Uint8Array, fileName: string): Promise<SpecParagraph[]> {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  try {
    if (ext === "docx" || ext === "odt") {
      const files = unzip(Buffer.from(bytes), { maxBytes: 50_000_000 });
      const xml = files.get(ext === "docx" ? "word/document.xml" : "content.xml");
      if (!xml) throw new SpecError("Document illisible");
      return ext === "docx" ? docxParagraphs(xml.toString("utf8")) : odtParagraphs(xml.toString("utf8"));
    }
  } catch (e) {
    if (e instanceof SpecError) throw e;
    throw new SpecError("Document illisible : enregistrez-le de nouveau au format .docx");
  }
  if (ext === "txt" || ext === "md") return textParagraphs(new TextDecoder().decode(bytes));
  if (ext === "pdf") {
    const paragraphs = textParagraphs(await pdfText(bytes));
    const letters = paragraphs
      .map((p) => p.text)
      .join(" ")
      .replace(/[^a-zà-ÿ]/gi, "").length;
    if (letters < 200)
      throw new SpecError("Ce PDF ne contient pas de texte lisible (document scanné ou police non standard) : demandez le CCTP au format Word (.docx).");
    return paragraphs;
  }
  throw new SpecError("Format non pris en charge : .docx, .odt, .pdf ou .txt");
}

export interface SpecArticle {
  ref: string;
  title: string;
  /** Localisation ou première phrase descriptive */
  description: string;
  quantity: string;
  unit: string;
}

export interface SpecLot {
  ref: string;
  title: string;
  articles: SpecArticle[];
}

export interface SpecReading {
  lots: SpecLot[];
  /** DTU et normes cités, dans l'ordre d'apparition */
  references: string[];
}

const LOT = /^lot\s*(?:n\s*[°o.]?\s*)?(\d{1,3}[a-z]?)\s*[-:.–]?\s*(.*)$/i;
const NUMBERED = /^(\d{1,3}(?:\.\d{1,3}){0,5})\.?\s+(\S.{1,180})$/;
const GENERIC =
  /^(g[ée]n[ée]ralit[ée]s|objet|pr[ée]ambule|prescriptions|documents? de r[ée]f[ée]rence|normes|consistance|description g[ée]n[ée]rale|sommaire|dispositions|essais|r[ée]ception|nettoyage|provenance|qualit[ée] des mat[ée]riaux|mode d.ex[ée]cution|stockage|limites? de prestations?)/i;
const UNIT = String.raw`m²|m2|m³|m3|ml|m\.l\.|mètres? linéaires?|ens(?:emble)?\b|forfaits?\b|ft\b|u\b|unités?\b|pi[eè]ces?\b`;
const NUMBER = String.raw`(\d+(?:[  .]\d{3})*(?:,\d+|\.\d{1,2})?)`;
const QTY = new RegExp(String.raw`${NUMBER}\s*(${UNIT})`, "i");
/** Quantité annoncée explicitement (« Quantité : 45 m² »), préférée à un nombre cité dans le texte */
const QTY_HINT = new RegExp(String.raw`(?:quantit[ée]|qt[ée]|surface|longueur|nombre)[^:\d]{0,20}:?\s*${NUMBER}\s*(${UNIT})`, "i");
const DTU = /\b(?:NF\s+)?DTU\s*\d{1,2}(?:\.\d{1,2})*(?:\s*P\s*\d+(?:-\d+)*)?|\bNF\s+(?:EN\s+)?[A-Z]?\s?\d{2,5}(?:-\d+)*/g;

export function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase().replace(/\s+/g, " ");
  if (u === "m2" || u === "m²") return "m²";
  if (u === "m3" || u === "m³") return "m³";
  if (u === "ml" || u === "m.l." || u.startsWith("mètre")) return "ml";
  if (u.startsWith("ens") || u.startsWith("forfait") || u === "ft") return "ens";
  if (u === "u" || u.startsWith("unit") || u.startsWith("pi")) return "u";
  return u;
}

const quantityOf = (s: string): { quantity: string; unit: string } | null => {
  const m = QTY_HINT.exec(s) ?? QTY.exec(s);
  if (!m) return null;
  const q = m[1]
    .replace(/[  ]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(".", ",");
  return { quantity: q, unit: normalizeUnit(m[2]) };
};

/** Lots, articles et références d'un CCTP. Un document sans lot déclaré forme un seul lot. */
export function readSpec(paragraphs: readonly SpecParagraph[]): SpecReading {
  const lots: SpecLot[] = [];
  const references: string[] = [];
  let lot: SpecLot | null = null;
  let article: SpecArticle | null = null;
  let body: string[] = [];
  const closeArticle = () => {
    if (!article) return;
    const text = body.join(" ");
    const q = quantityOf(text);
    if (q) Object.assign(article, q);
    const where = body.map((b) => /localisation\s*:?\s*([^.;]{3,200})/i.exec(b)?.[1]).find(Boolean);
    article.description = clean(where ? `Localisation : ${where}` : (body[0] ?? "").slice(0, 300));
    article = null;
    body = [];
  };
  const ensureLot = () => {
    if (!lot) {
      lot = { ref: "", title: "Travaux", articles: [] };
      lots.push(lot);
    }
    return lot;
  };
  for (const p of paragraphs) {
    for (const m of p.text.matchAll(DTU)) {
      const r = clean(m[0]).replace(/\s+P\s*/, " P");
      if (!references.includes(r)) references.push(r);
    }
    const l = LOT.exec(p.text);
    if (l && p.text.length < 160) {
      closeArticle();
      lot = { ref: l[1].toUpperCase(), title: clean(l[2]).replace(/^[-:.–\s]+/, "") || `Lot ${l[1]}`, articles: [] };
      lots.push(lot);
      continue;
    }
    const n = NUMBERED.exec(p.text);
    if (n && (p.heading > 0 || n[2].length < 120) && !/[.;:]$/.test(n[2]) && !QTY.test(n[2].slice(0, 3))) {
      closeArticle();
      const title = clean(n[2]);
      if (GENERIC.test(title)) continue;
      // Un titre sans point (« 3 CARRELAGE ») dans un document sans lots ouvre un lot.
      if (!n[1].includes(".") && !lots.some((x) => x.ref)) {
        lot = { ref: n[1], title, articles: [] };
        lots.push(lot);
        continue;
      }
      article = { ref: n[1], title, description: "", quantity: "1", unit: "ens" };
      ensureLot().articles.push(article);
      continue;
    }
    if (article) body.push(p.text);
  }
  closeArticle();
  // Un article qui a des sous-articles n'est qu'un titre : on ne garde que les feuilles.
  for (const x of lots) x.articles = x.articles.filter((a) => !x.articles.some((b) => b !== a && b.ref.startsWith(`${a.ref}.`)));
  return { lots: lots.filter((x) => x.articles.length), references };
}
