import { api } from "@/lib/server/session";
import { exportHomeRecord } from "@/lib/services/home-records";

/** Carnet du logement au format d'échange ouvert (JSON). */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const data = await exportHomeRecord(ctx, params.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="carnet-logement.json"',
      "cache-control": "no-store",
    },
  });
});
