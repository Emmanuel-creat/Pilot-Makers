import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { REFERENCE_YEARS } from "@/lib/biosourced";
import { formatCarbon } from "@/lib/carbon";
import { requirePageCtx } from "@/lib/server/session";
import { quoteAlternatives } from "@/lib/services/biosourced";
import { getDraft } from "@/lib/services/quotes";
import { EDITABLE_STATUSES } from "@/lib/services/quote-types";
import { biosourcedVariantAction } from "@/app/actions";

export const metadata = { title: "Alternatives biosourcées" };

export default async function BiosourcedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const draft = await getDraft(ctx, id).catch(() => null);
  if (!draft) notFound();
  const lines = await quoteAlternatives(ctx, id);
  const editable = EDITABLE_STATUSES.includes(draft.status) && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Alternatives biosourcées"
        back={{ href: `/app/devis/${id}`, label: draft.number ?? "Devis" }}
        subtitle={`Matériaux d'origine végétale qui rendent le même service, comparés sur ${REFERENCE_YEARS} ans : fabrication, remplacements, carbone stocké et fin de vie. Ordres de grandeur à confirmer par la fiche FDES du produit retenu.`}
      />
      {lines.length === 0 ? (
        <Empty icon="sun" title="Aucune alternative pour ce devis">
          Les alternatives couvrent l&apos;isolation, les fenêtres, les peintures, les parquets, les enduits et les sols souples.
        </Empty>
      ) : (
        lines.map((l) => (
          <Section key={l.lineId} title={`${l.label} : ${l.quantity.toLocaleString("fr-FR")} ${l.unit}`}>
            <p className="mb-3 text-sm text-muted">
              Solution prévue ({l.conventional.label.toLowerCase()}) : {formatCarbon(l.conventional.lifecycleGrams)} sur {REFERENCE_YEARS} ans, durée de vie{" "}
              {l.conventional.lifespanYears} ans, fin de vie : {l.conventional.endOfLife.toLowerCase()}.
            </p>
            <ul className="divide-y divide-line" data-testid="alternatives">
              {l.alternatives.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{a.label}</p>
                    <p className="text-xs text-muted">{a.note}</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-muted">Sur {REFERENCE_YEARS} ans</dt>
                        <dd className="tabular">{formatCarbon(a.lifecycleGrams)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Gain</dt>
                        <dd className={`tabular ${a.savedGrams > 0 ? "text-success" : "text-warning"}`}>
                          {a.savedGrams >= 0 ? formatCarbon(a.savedGrams) : `+${formatCarbon(-a.savedGrams)}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Carbone stocké</dt>
                        <dd className="tabular">{a.storedTotalGrams ? formatCarbon(a.storedTotalGrams) : "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Prix fourniture</dt>
                        <dd className="tabular">
                          {a.costDeltaPercent > 0 ? "+" : ""}
                          {a.costDeltaPercent} %
                        </dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted">
                      Durée de vie {a.lifespanYears} ans. Fin de vie : {a.endOfLife.toLowerCase()}.
                    </p>
                  </div>
                  {editable ? (
                    <ActionForm action={biosourcedVariantAction} className="shrink-0">
                      <input type="hidden" name="quoteId" value={id} />
                      <input type="hidden" name="lineId" value={l.lineId} />
                      <input type="hidden" name="alternativeId" value={a.id} />
                      <Submit className="btn-secondary">Proposer en option</Submit>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </div>
  );
}
