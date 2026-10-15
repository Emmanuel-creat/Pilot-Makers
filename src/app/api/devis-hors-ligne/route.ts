import { api, readJson } from "@/lib/server/session";
import { createOfflineQuote } from "@/lib/services/quotes";

/** Envoi d'un devis préparé sans réseau, au retour de la connexion. */
export const POST = api(async ({ req, ctx }) => createOfflineQuote(ctx, await readJson(req)));
