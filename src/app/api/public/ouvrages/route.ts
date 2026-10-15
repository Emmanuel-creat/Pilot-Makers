import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { openDataExport } from "@/lib/services/open-works";

/** Export ouvert de la base des ouvrages, sous Licence Ouverte 2.0. */
export async function GET() {
  try {
    return Response.json(await openDataExport(await getDb()), { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return errorResponse(e);
  }
}
