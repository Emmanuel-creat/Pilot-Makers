import { apiV1 } from "@/lib/server/api-v1";
import { apiGetQuote } from "@/lib/services/public-api";

export const GET = apiV1<{ id: string }>(async ({ ctx, params }) => apiGetQuote(ctx, params.id));
