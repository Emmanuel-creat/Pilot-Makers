import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { requestMeta, setSessionCookie } from "@/lib/server/session";
import { createSession } from "@/lib/services/accounts";
import { appUrl } from "@/lib/services/mail";
import { finishSso } from "@/lib/services/sso";

/** Retour du fournisseur d'identité : la session s'ouvre si le jeton est vérifié et la personne membre de l'entreprise. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (msg: string) => NextResponse.redirect(appUrl(`/connexion?sso=${encodeURIComponent(msg)}`), 303);
  try {
    if (u.searchParams.get("error")) return back("Connexion annulée ou refusée par le fournisseur d'identité");
    const db = await getDb();
    const r = await finishSso(db, { state: u.searchParams.get("state") ?? "", code: u.searchParams.get("code") ?? "" });
    await setSessionCookie(await createSession(db, r.userId, await requestMeta()));
    return NextResponse.redirect(appUrl(r.next), 303);
  } catch (e) {
    return back(e instanceof HttpError ? e.message : "Connexion d'entreprise impossible pour le moment");
  }
}
