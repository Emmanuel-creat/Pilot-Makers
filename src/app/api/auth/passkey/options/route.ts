import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { beginPasskeyLogin } from "@/lib/services/passkeys";

/** Défi de connexion par clé d'accès. */
export async function POST() {
  try {
    return NextResponse.json(await beginPasskeyLogin(await getDb(), (await requestMeta()).ip));
  } catch (e) {
    return errorResponse(e);
  }
}
