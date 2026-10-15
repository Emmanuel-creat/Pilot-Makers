/** Export et import d'un devis au format ouvert Devis ouvert. */

import { computeQuote } from "@/lib/calc/engine";
import { draftToCalcInput } from "@/lib/calc/draft";
import { one } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { EXCHANGE_FORMAT, fromExchange, toExchange, type ExchangeDocument } from "@/lib/quote-exchange";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { customerDisplayName } from "./customers";
import { createQuote, getDraft, quoteVatExempt, saveDraft } from "./quotes";
import { randomUUID } from "node:crypto";

export async function exportQuoteExchange(ctx: Ctx, quoteId: string): Promise<{ doc: ExchangeDocument; filename: string }> {
  const d = await getDraft(ctx, quoteId);
  const org = await one<Record<string, string>>(ctx.db, "SELECT * FROM organizations WHERE id=$1", [ctx.orgId]);
  const c = d.customerId ? await one<Record<string, string>>(ctx.db, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [d.customerId, ctx.orgId]) : null;
  const issued = await one<{ issued_at: Date | null }>(ctx.db, "SELECT issued_at FROM quotes WHERE id=$1", [quoteId]);
  const calc = computeQuote(draftToCalcInput(d, quoteVatExempt({ vat_regime: org!.vat_regime } as never, d)));
  const doc = toExchange({
    number: d.number,
    title: d.title,
    description: d.description,
    issueDate: issued?.issued_at ? issued.issued_at.toISOString().slice(0, 10) : null,
    validityDays: d.validityDays || null,
    seller: {
      name: org!.trade_name || org!.legal_name,
      siret: org!.siret ?? "",
      vatNumber: org!.vat_number ?? "",
      address: {
        line1: org!.address_line1 ?? "",
        line2: org!.address_line2 ?? "",
        postalCode: org!.postal_code ?? "",
        city: org!.city ?? "",
        country: "France",
      },
      email: org!.email ?? "",
      phone: org!.phone ?? "",
    },
    buyer: c
      ? {
          name: customerDisplayName(c as never),
          address: { line1: c.billing_line1, line2: c.billing_line2, postalCode: c.billing_postal_code, city: c.billing_city, country: c.billing_country },
          email: c.email,
          phone: c.phone,
        }
      : null,
    site: d.site,
    sections: d.sections,
    globalDiscount: d.globalDiscount,
    paymentTerms: d.paymentTerms,
    depositPercent: d.depositPercent,
    estimatedDuration: d.estimatedDuration,
    totals: calc,
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.exchange_export", target: quoteId });
  const base = (d.number || d.title || "devis").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "devis";
  return { doc, filename: `${base}${EXCHANGE_FORMAT.extension}` };
}

/** Reprend un fichier Devis ouvert en brouillon, prix et taux tels qu'envoyés, à relire avant tout envoi. */
export async function importQuoteExchange(ctx: Ctx, json: string, customerId: string | null): Promise<{ id: string; warnings: string[] }> {
  requireWritable(ctx);
  if (json.length > 2_000_000) throw badRequest("Fichier trop volumineux (2 Mo au plus)");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw badRequest("Fichier illisible : un fichier JSON au format Devis ouvert est attendu");
  }
  let parsed: ReturnType<typeof fromExchange>;
  try {
    parsed = fromExchange(raw);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  const { doc, sections, warnings } = parsed;
  const id = await createQuote(ctx, { customerId: customerId || null, title: doc.document.title.slice(0, 200) });
  const d = await getDraft(ctx, id);
  const from = doc.document.seller.name ? `Repris du devis ${doc.document.number || ""} de ${doc.document.seller.name}`.replace("  ", " ") : "";
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      description: doc.document.description,
      site: {
        line1: doc.document.site.line1 ?? "",
        line2: doc.document.site.line2 ?? "",
        postalCode: doc.document.site.postalCode ?? "",
        city: doc.document.site.city ?? "",
      },
      globalDiscount: doc.document.globalDiscountPercent ?? "",
      internalNotes: [d.internalNotes, from].filter(Boolean).join("\n"),
      sections: sections.map((s) => ({
        id: randomUUID(),
        title: s.title,
        description: s.description,
        lines: s.lines.map((l) => ({ ...l, id: randomUUID(), catalogItemId: null, unitCost: "", estimated: false, estimateNote: "" })),
      })),
    },
    d.draftRevision,
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.exchange_import", target: id });
  return { id, warnings };
}
