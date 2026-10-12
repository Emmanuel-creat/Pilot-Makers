import { getDb } from "@/lib/db";
import { api, readJson, requestMeta } from "@/lib/server/session";
import { respondFromLink } from "@/lib/services/quotes";

export const POST = api<{ token: string }>(
  async ({ req, params }) => respondFromLink(await getDb(), params.token, await readJson(req), await requestMeta()),
  { auth: false },
);
