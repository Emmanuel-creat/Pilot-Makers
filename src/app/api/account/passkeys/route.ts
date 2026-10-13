import { deviceName } from "@/lib/device";
import { api, readJson } from "@/lib/server/session";
import { finishPasskeyRegistration } from "@/lib/services/passkeys";

export const POST = api(async ({ req, ctx }) => ({ id: await finishPasskeyRegistration(ctx, await readJson(req), deviceName(req.headers.get("user-agent") ?? "")) }));
