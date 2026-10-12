import { api } from "@/lib/server/session";
import { createRevision } from "@/lib/services/quotes";

export const POST = api<{ id: string }>(async ({ ctx, params }) => createRevision(ctx, params.id));
