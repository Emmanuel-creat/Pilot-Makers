import { api } from "@/lib/server/session";
import { exportAccountData } from "@/lib/services/export";

export const GET = api(async ({ ctx }) => {
  const data = await exportAccountData(ctx);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pilot-makers-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
