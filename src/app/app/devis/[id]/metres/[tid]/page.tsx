import { notFound } from "next/navigation";
import { deleteTakeoffAction } from "@/app/actions";
import { PageHeader } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { getTakeoff } from "@/lib/services/takeoffs";
import { Measurer } from "./Measurer";

export const metadata = { title: "Métré sur plan" };

export default async function TakeoffPage({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const ctx = await requirePageCtx();
  const { id, tid } = await params;
  let t;
  try {
    t = await getTakeoff(ctx, tid);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  if (t.quoteId !== id) notFound();
  const editable = t.editable && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t.name}
        subtitle={`Métré pour ${t.quoteTitle}${t.editable ? "" : " : devis émis, relevés en lecture seule"}.`}
        back={{ href: `/app/devis/${id}/metres`, label: "Plans du devis" }}
        actions={
          editable ? (
            <form action={deleteTakeoffAction}>
              <input type="hidden" name="id" value={t.id} />
              <button type="submit" className="btn-ghost text-danger">
                Supprimer le plan
              </button>
            </form>
          ) : null
        }
      />
      <Measurer id={t.id} quoteId={id} src={`/api/takeoffs/${t.id}`} editable={editable} pxPerM={t.pxPerM} measurements={t.measurements} />
    </div>
  );
}
