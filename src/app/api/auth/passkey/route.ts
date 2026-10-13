import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { forbidden } from "@/lib/http";
import { errorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/server/session";
import { createSession } from "@/lib/services/accounts";
import { finishPasskeyLogin } from "@/lib/services/passkeys";

/** Connexion par clé d'accès : la signature vérifiée ouvre la session. */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) throw forbidden("Origine de la requête refusée");
    const db = await getDb();
    const meta = await requestMeta();
    const userId = await finishPasskeyLogin(db, await readJson(req), meta.ip);
    await setSessionCookie(await createSession(db, userId, meta));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
