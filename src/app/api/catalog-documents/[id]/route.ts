import { api } from "@/lib/server/session";
import { catalogDocumentFile, removeCatalogDocument } from "@/lib/services/datasheets";

const fileName = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "document";

export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const f = await catalogDocumentFile(ctx, params.id);
  return new Response(Buffer.from(f.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fileName(f.title)}.pdf"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});

export const DELETE = api<{ id: string }>(async ({ ctx, params }) => {
  await removeCatalogDocument(ctx, params.id);
  return { ok: true };
});
