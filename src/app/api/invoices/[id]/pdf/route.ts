import { api } from "@/lib/server/session";
import { getInvoicePdf } from "@/lib/services/invoices";

/** PDF figé d'une facture ou d'un avoir, réservé aux membres de l'entreprise. */
export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const r = await getInvoicePdf(ctx, params.id);
  const download = new URL(req.url).searchParams.get("download");
  return new Response(Buffer.from(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${r.number}.pdf"`,
      "x-content-sha256": r.pdf_sha256,
      "cache-control": "private, no-store",
    },
  });
});
