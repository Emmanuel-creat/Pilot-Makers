import { api, readJson } from "@/lib/server/session";
import { recordResponseManually } from "@/lib/services/quotes";

/** Acceptation (ou refus) enregistrée par l'entreprise, avec la preuve correspondante. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => recordResponseManually(ctx, params.id, await readJson(req)));
