import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    await db.query("SELECT 1");
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
