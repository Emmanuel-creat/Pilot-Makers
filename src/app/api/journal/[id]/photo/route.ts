import { api } from "@/lib/server/session";
import { journalPhoto } from "@/lib/services/job-site";

/** Photo du journal de chantier, réservée aux membres de l'entreprise. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const p = await journalPhoto(ctx, params.id);
  return new Response(Buffer.from(p.bytes), {
    headers: { "content-type": p.type, "cache-control": "private, max-age=86400", etag: `"${p.sha256}"`, "x-content-type-options": "nosniff" },
  });
});
