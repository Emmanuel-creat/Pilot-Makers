import { apiV1, intParam } from "@/lib/server/api-v1";
import { apiListQuotes } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx, url }) =>
  apiListQuotes(ctx, {
    status: url.searchParams.get("status") ?? undefined,
    customerId: url.searchParams.get("customer_id") ?? undefined,
    page: intParam(url, "page", 1, 1, 1e6),
    pageSize: intParam(url, "page_size", 25, 1, 100),
  }),
);
