import { apiV1, intParam } from "@/lib/server/api-v1";
import { apiListInvoices } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx, url }) =>
  apiListInvoices(ctx, {
    status: url.searchParams.get("status") ?? undefined,
    customerId: url.searchParams.get("customer_id") ?? undefined,
    limit: intParam(url, "limit", 100, 1, 500),
  }),
);
