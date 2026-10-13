import { api } from "@/lib/server/session";
import { appearancePreviewPdf } from "@/lib/services/quotes";

/** Aperçu du dernier devis avec le modèle, la police, la couleur et la mention enregistrés dans l'onglet Apparence. */
export const GET = api(async ({ ctx }) => {
  const pdf = await appearancePreviewPdf(ctx);
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="apercu-modele.pdf"', "cache-control": "no-store" },
  });
});
