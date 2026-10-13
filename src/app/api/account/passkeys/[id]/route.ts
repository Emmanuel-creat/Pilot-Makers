import { api } from "@/lib/server/session";
import { removePasskey } from "@/lib/services/passkeys";

export const DELETE = api<{ id: string }>(async ({ ctx, params }) => {
  await removePasskey(ctx, params.id);
  return { ok: true };
});
