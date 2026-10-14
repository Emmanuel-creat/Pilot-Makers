import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Section } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { listTakeoffs } from "@/lib/services/takeoffs";
import { PlanUpload } from "./PlanUpload";

export const metadata = { title: "Métré sur plan" };

export default async function TakeoffsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageCtx();
  const { id } = await params;
  let list;
  try {
    list = await listTakeoffs(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Métré sur plan"
        subtitle="Importez le plan, indiquez une cote connue, puis relevez longueurs, surfaces, murs et éléments à compter."
        back={{ href: `/app/devis/${id}`, label: "Devis" }}
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Plans du devis">
          {list.length ? (
            <ul className="divide-y divide-line text-sm" data-testid="plans">
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link href={`/app/devis/${id}/metres/${t.id}`} className="link font-medium">
                    {t.name}
                  </Link>
                  <span className="text-xs text-muted">
                    {t.count} relevé{t.count > 1 ? "s" : ""}
                    {t.calibrated ? "" : ", échelle à indiquer"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="note" title="Aucun plan">
              Une photo nette ou une capture du plan de l&apos;architecte suffit. Pour un PDF, exportez la page en image.
            </Empty>
          )}
        </Section>
        {canEdit ? (
          <Section title="Importer un plan">
            <PlanUpload quoteId={id} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
