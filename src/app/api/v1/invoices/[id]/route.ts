import { isUuid, notFound } from "@/lib/http";
import { apiV1 } from "@/lib/server/api-v1";
import { apiGetInvoice } from "@/lib/services/public-api";

export const GET = apiV1<{ id: string }>(async ({ ctx, params }) => {
  if (!isUuid(params.id)) throw notFound("Facture introuvable");
  return apiGetInvoice(ctx, params.id);
});
