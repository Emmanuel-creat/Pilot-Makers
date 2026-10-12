import { api } from "@/lib/server/session";
import { getSubscription, listPlans } from "@/lib/services/billing";

export const GET = api(async ({ ctx }) => ({
  subscription: await getSubscription(ctx.db, ctx.orgId),
  entitlements: ctx.entitlements,
  plans: await listPlans(ctx.db),
}));
