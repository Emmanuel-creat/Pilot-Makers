import { api, readJson } from "@/lib/server/session";
import { proposeDraft } from "@/lib/services/assistant";

export const POST = api(async ({ req, ctx }) => proposeDraft(ctx, await readJson(req)));
