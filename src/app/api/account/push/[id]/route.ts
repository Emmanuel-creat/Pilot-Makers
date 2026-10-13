import { api } from "@/lib/server/session";
import { removePushDevice } from "@/lib/services/push";

export const DELETE = api<{ id: string }>(async ({ ctx, params }) => {
  await removePushDevice(ctx, params.id);
  return { ok: true };
});
