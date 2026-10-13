import { apiV1, intParam, readBody } from "@/lib/server/api-v1";
import { apiCreateCatalogItem, apiListCatalog } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx, url }) =>
  apiListCatalog(ctx, { q: url.searchParams.get("q") ?? undefined, limit: intParam(url, "limit", 200, 1, 2000) }),
);

export const POST = apiV1(async ({ ctx, req }) => apiCreateCatalogItem(ctx, await readBody(req)));
