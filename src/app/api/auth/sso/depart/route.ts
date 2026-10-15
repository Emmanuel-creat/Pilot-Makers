import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/server/session";
import { startSso } from "@/lib/services/sso";
import { appUrl } from "@/lib/services/mail";

/** Connexion d'entreprise : envoi vers le fournisseur d'identité de l'entreprise de l'adresse saisie. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (msg: string) => NextResponse.redirect(appUrl(`/connexion?sso=${encodeURIComponent(msg)}`), 303);
  try {
    const db = await getDb();
    await hitRate(db, "public.view", (await requestMeta()).ip);
    return NextResponse.redirect(await startSso(db, u.searchParams.get("email") ?? "", u.searchParams.get("next") ?? ""), 303);
  } catch (e) {
    return back(e instanceof HttpError ? e.message : "Connexion d'entreprise indisponible pour le moment");
  }
}
