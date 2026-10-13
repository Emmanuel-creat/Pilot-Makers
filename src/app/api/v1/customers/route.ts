import { apiV1, intParam, readBody } from "@/lib/server/api-v1";
import { apiCreateCustomer, apiListCustomers } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx, url }) =>
  apiListCustomers(ctx, {
    q: url.searchParams.get("q") ?? undefined,
    limit: intParam(url, "limit", 50, 1, 500),
    offset: intParam(url, "offset", 0, 0, 1e6),
  }),
);

export const POST = apiV1(async ({ ctx, req }) => apiCreateCustomer(ctx, await readBody(req)));
