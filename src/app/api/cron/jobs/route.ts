import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { safeEqual } from "@/lib/security";
import { JOB_HANDLERS } from "@/lib/services/job-handlers";
import { runJobs } from "@/lib/services/task-queue";

/** File de tâches en arrière-plan : toutes les minutes, avec l'en-tête Authorization: Bearer CRON_SECRET. */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET ?? "";
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!secret || !safeEqual(given, secret)) return new Response("Non autorisé", { status: 401 });
    return Response.json(await runJobs(await getDb(), JOB_HANDLERS));
  } catch (e) {
    return errorResponse(e);
  }
}
