import { api } from "@/lib/server/session";
import { evidenceZip } from "@/lib/services/evidence";

/** Dossier de preuves du chantier : archive ZIP avec empreintes SHA-256. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const z = await evidenceZip(ctx, params.id);
  return new Response(new Uint8Array(z.data), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${z.filename
        .normalize("NFD")
        .replace(/[^\x20-\x7e]/g, "")
        .replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(z.filename)}`,
      "x-content-sha256": z.sha256,
      "cache-control": "private, no-store",
    },
  });
});
