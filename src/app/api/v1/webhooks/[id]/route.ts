import { apiV1 } from "@/lib/server/api-v1";
import { apiUnsubscribe } from "@/lib/services/public-api";

export const DELETE = apiV1<{ id: string }>(async ({ ctx, params }) => apiUnsubscribe(ctx, params.id));
