import { getDb } from "@/lib/db";
import { api, readJson, requestMeta } from "@/lib/server/session";
import { postFromPortal } from "@/lib/services/client-space";

/** Message du client depuis son espace, sur l'un de ses devis. */
export const POST = api<{ token: string }>(
  async ({ req, params }) => {
    const body = await readJson(req);
    return { id: await postFromPortal(await getDb(), params.token, String(body.quoteId ?? ""), body, await requestMeta()) };
  },
  { auth: false },
);
