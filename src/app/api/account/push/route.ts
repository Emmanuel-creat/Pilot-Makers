import { deviceName } from "@/lib/device";
import { api, readJson } from "@/lib/server/session";
import { subscribePush, unsubscribePush, vapidKeys } from "@/lib/services/push";

/** Clé publique du serveur, à donner au navigateur pour s'abonner. */
export const GET = api(async ({ ctx }) => ({ publicKey: (await vapidKeys(ctx.db)).publicKey }));

export const POST = api(async ({ req, ctx }) => ({ id: await subscribePush(ctx, await readJson(req), deviceName(req.headers.get("user-agent") ?? "")) }));

export const DELETE = api(async ({ req, ctx }) => {
  await unsubscribePush(ctx, String((await readJson(req)).endpoint ?? ""));
  return { ok: true };
});
