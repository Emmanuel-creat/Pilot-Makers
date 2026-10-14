import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { importTable } from "@/lib/server/import-body";
import { api, readJson } from "@/lib/server/session";
import { parseCsv } from "@/lib/csv";
import { importSupplierInvoice, importSupplierPrices } from "@/lib/services/supplier-prices";

const MAX_BYTES = 5_000_000;

/**
 * Fichier de prix d'un fournisseur, ou facture d'achat électronique (PDF Factur-X, XML) : aperçu des prix d'achat
 * modifiés, puis application après confirmation.
 */
export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const commit = body.commit === true;
  const opts = { supplier: body.supplier, minMarginPercent: body.minMarginPercent };
  if (typeof body.file === "string" && typeof body.name === "string" && /\.(pdf|xml)$/i.test(body.name)) {
    if (body.file.length > Math.ceil((MAX_BYTES * 4) / 3) + 4) throw badRequest("Fichier trop volumineux (5 Mo maximum)");
    if (commit) await hitRate(ctx.db, "files.transfer", ctx.orgId);
    return importSupplierInvoice(ctx, opts, new Uint8Array(Buffer.from(body.file, "base64")), commit);
  }
  const raw = importTable(body);
  const table = typeof raw === "string" ? parseCsv(raw) : raw;
  if (!table.length) throw badRequest("Fichier vide");
  if (commit) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  return importSupplierPrices(ctx, opts, table, commit);
});
