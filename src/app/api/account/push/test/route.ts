import { api } from "@/lib/server/session";
import { testPush } from "@/lib/services/push";

export const POST = api(async ({ ctx }) => ({ queued: await testPush(ctx) }));
