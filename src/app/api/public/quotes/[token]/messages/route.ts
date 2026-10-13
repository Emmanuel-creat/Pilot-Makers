import { getDb } from "@/lib/db";
import { api, readJson, requestMeta } from "@/lib/server/session";
import { postFromQuoteLink } from "@/lib/services/client-space";

/** Message ou demande de modification du client, depuis la page du devis. */
export const POST = api<{ token: string }>(
  async ({ req, params }) => ({ id: await postFromQuoteLink(await getDb(), params.token, await readJson(req), await requestMeta()) }),
  { auth: false },
);
