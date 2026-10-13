import { api } from "@/lib/server/session";
import { toggleVote } from "@/lib/services/roadmap";

/** Soutien d'un sujet de la feuille de route, ou retrait du vote. */
export const POST = api<{ id: string }>(async ({ ctx, params }) => toggleVote(ctx, params.id));
