import { isUuid, notFound } from "@/lib/http";
import { apiV1 } from "@/lib/server/api-v1";
import { apiGetJob } from "@/lib/services/public-api";

export const GET = apiV1<{ id: string }>(async ({ ctx, params }) => {
  if (!isUuid(params.id)) throw notFound("Chantier introuvable");
  return apiGetJob(ctx, params.id);
});
