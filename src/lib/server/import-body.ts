import { badRequest } from "@/lib/http";
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
