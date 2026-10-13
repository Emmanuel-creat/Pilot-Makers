import { api, readJson, requestMeta } from "@/lib/server/session";
import { signOnSite } from "@/lib/services/onsite-signature";

/** Signature du client recueillie sur l'écran de l'entreprise. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => signOnSite(ctx, params.id, await readJson(req), await requestMeta()));
