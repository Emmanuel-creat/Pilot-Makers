import { apiV1, readBody } from "@/lib/server/api-v1";
import { apiListSubscriptions, apiSubscribe } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx }) => apiListSubscriptions(ctx));

export const POST = apiV1(async ({ ctx, req }) => apiSubscribe(ctx, await readBody(req)));
