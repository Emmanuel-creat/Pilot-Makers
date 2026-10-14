import { getDb } from "@/lib/db";
import { errorResponse, readJson, requestMeta } from "@/lib/server/session";
import { requestMatch } from "@/lib/services/matching";

/** Demande d'un particulier transmise aux artisans disponibles de son département. */
export async function POST(req: Request) {
  try {
    return Response.json(await requestMatch(await getDb(), await readJson(req), await requestMeta()));
  } catch (e) {
    return errorResponse(e);
  }
}
