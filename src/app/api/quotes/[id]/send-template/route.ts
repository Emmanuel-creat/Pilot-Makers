import { api } from "@/lib/server/session";
import { prepareSendMessage } from "@/lib/services/quotes";

export const GET = api<{ id: string }>(async ({ ctx, params }) => prepareSendMessage(ctx, params.id));
