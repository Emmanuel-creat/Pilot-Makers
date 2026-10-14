import { api, readJson } from "@/lib/server/session";
import { estimateLinesDuration } from "@/lib/services/duration";

/** Durée du chantier et équipe conseillée pour les lignes de main-d'oeuvre envoyées par l'éditeur de devis. */
export const POST = api(async ({ req, ctx }) => estimateLinesDuration(ctx, await readJson(req)));
