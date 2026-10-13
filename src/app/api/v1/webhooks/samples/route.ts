import { apiV1 } from "@/lib/server/api-v1";
import { apiSamples } from "@/lib/services/public-api";

export const GET = apiV1(async ({ url }) => apiSamples(url.searchParams.get("event") ?? undefined));
