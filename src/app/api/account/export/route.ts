import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { exportAccountData, exportArchive } from "@/lib/services/export";

export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const day = new Date().toISOString().slice(0, 10);
  if (new URL(req.url).searchParams.get("format") === "zip") {
    const archive = await exportArchive(ctx);
    return new Response(new Uint8Array(archive), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="pilot-makers-export-${day}.zip"`,
        "cache-control": "no-store",
      },
    });
  }
  const data = await exportAccountData(ctx);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pilot-makers-export-${day}.json"`,
      "cache-control": "no-store",
    },
  });
});
