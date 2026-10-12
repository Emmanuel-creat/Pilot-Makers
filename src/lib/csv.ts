/**
 * Lecture et écriture CSV (RFC 4180), avec détection du séparateur ";" ou ","
 * (Excel en français utilise ";").
 */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const tab = (firstLine.match(/\t/g) ?? []).length;
  if (tab > semi && tab > comma) return "\t";
  return semi >= comma ? ";" : ",";
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === d) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function escapeCell(v: string, d: string): string {
  // Neutralise les formules pour éviter l'injection dans les tableurs.
  let s = v;
  if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /["\n\r]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Produit un CSV séparé par ";" avec BOM, lisible directement par Excel. */
export function toCsv(header: string[], rows: string[][], d = ";"): string {
  return "﻿" + [header, ...rows].map((r) => r.map((c) => escapeCell(c, d)).join(d)).join("\r\n") + "\r\n";
}
