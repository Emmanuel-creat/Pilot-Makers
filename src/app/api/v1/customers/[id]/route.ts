import { isUuid, notFound } from "@/lib/http";
import { apiV1 } from "@/lib/server/api-v1";
import { apiGetCustomer } from "@/lib/services/public-api";

export const GET = apiV1<{ id: string }>(async ({ ctx, params }) => {
  if (!isUuid(params.id)) throw notFound("Client introuvable");
  return apiGetCustomer(ctx, params.id);
});
