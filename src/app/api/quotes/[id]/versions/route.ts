import { api } from "@/lib/server/session";
import { listVersions } from "@/lib/services/quotes";

export const GET = api<{ id: string }>(async ({ ctx, params }) => ({ versions: await listVersions(ctx, params.id) }));
