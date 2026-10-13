import { badRequest } from "@/lib/http";
import { IGNORED_COLUMN, IMPORT_FIELDS, type ImportColumn, type ImportKind } from "@/lib/import-fields";
import { parseCsv } from "@/lib/csv";
import { readTable, SheetError } from "@/lib/sheet";

const MAX_BYTES = 5_000_000;

/**
 * Contenu d'un import : fichier transmis en base64 (CSV, Excel .xlsx ou LibreOffice .ods)
 * ou texte CSV déjà lu par le navigateur.
 */
export function importTable(body: Record<string, unknown>): string | string[][] {
  if (typeof body.file === "string") {
    if (body.file.length > Math.ceil((MAX_BYTES * 4) / 3) + 4) throw badRequest("Fichier trop volumineux (5 Mo maximum)");
    const bytes = Buffer.from(body.file, "base64");
    try {
      return readTable(bytes, typeof body.name === "string" ? body.name : "");
    } catch (e) {
      if (e instanceof SheetError) throw badRequest(e.message);
      throw e;
    }
  }
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (csv.length > MAX_BYTES) throw badRequest("Fichier trop volumineux (5 Mo maximum)");
  return csv;
}

/**
 * Applique les correspondances choisies à la main : { "3": "phone", "5": "" } fait de la 4e colonne le
 * téléphone et ignore la 6e. Les colonnes non citées gardent la reconnaissance automatique.
 */
export function applyMapping(input: string | string[][], mapping: unknown, kind: ImportKind): string[][] {
  const table = typeof input === "string" ? parseCsv(input) : input;
  if (!mapping || typeof mapping !== "object" || !table.length) return table;
  const allowed = new Set(IMPORT_FIELDS[kind].map((f) => f.value));
  const header = [...table[0]];
  for (const [k, v] of Object.entries(mapping as Record<string, unknown>)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= header.length) continue;
    if (v === "") header[i] = IGNORED_COLUMN;
    else if (typeof v === "string" && allowed.has(v)) header[i] = v;
    else throw badRequest("Correspondance de colonne inconnue");
  }
  return [header, ...table.slice(1)];
}

/** Colonnes du fichier, avec le champ retenu et un exemple de valeur, pour l'écran de correspondance. */
export function describeColumns(original: string[][], mapped: string[][], recognize: (h: string) => string | undefined): ImportColumn[] {
  return (original[0] ?? []).map((h, index) => {
    const m = mapped[0]?.[index] ?? h;
    return {
      index,
      header: h,
      field: m === IGNORED_COLUMN ? null : (recognize(m) ?? null),
      sample: (original.slice(1).find((r) => (r[index] ?? "").trim())?.[index] ?? "").trim().slice(0, 60),
    };
  });
}

/** Le fichier ressemble-t-il plutôt à l'autre import (clients au lieu d'articles, ou l'inverse) ? */
export function looksLikeOther(header: string[], mine: (h: string) => unknown, other: (h: string) => unknown) {
  const count = (f: (h: string) => unknown) => header.filter((h) => f(h)).length;
  return count(other) >= 3 && count(other) > count(mine) * 2;
}

export function asTable(input: string | string[][]): string[][] {
  return typeof input === "string" ? parseCsv(input) : input;
}
