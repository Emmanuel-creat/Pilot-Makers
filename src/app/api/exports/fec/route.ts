import { hitRate } from "@/lib/rate-limit";
import { forbidden } from "@/lib/http";
import { api } from "@/lib/server/session";
import { isReadOnlyMember, requirePermission, requireRole } from "@/lib/services/context";
import { buildAccountingExport } from "@/lib/services/fec";

/** Écritures comptables : /api/exports/fec?du=AAAA-MM-JJ&au=AAAA-MM-JJ&format=fec|csv */
export const GET = api(async ({ req, ctx }) => {
  if (ctx.supportAccess) throw forbidden("Export indisponible en accès support");
  // Le gérant, l'administration, ou le cabinet comptable invité.
  if (isReadOnlyMember(ctx)) requirePermission(ctx, "billing");
  else requireRole(ctx, "admin");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const u = new URL(req.url);
  const year = new Date().getFullYear();
  const r = await buildAccountingExport(
    ctx,
    u.searchParams.get("du") ?? `${year}-01-01`,
    u.searchParams.get("au") ?? `${year}-12-31`,
    u.searchParams.get("format") ?? "fec",
  );
  return new Response(r.content, {
    headers: {
      "content-type": r.contentType,
      "content-disposition": `attachment; filename="${r.filename}"`,
      "cache-control": "private, no-store",
    },
  });
});
