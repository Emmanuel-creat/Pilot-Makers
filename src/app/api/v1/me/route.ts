import { apiV1 } from "@/lib/server/api-v1";
import { apiMe } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx }) => apiMe(ctx));
