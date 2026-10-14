import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Notice, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { CONFIDENCE, REVIEW_ACTIONS, TOLERANCE_BP } from "@/lib/price-review";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { priceReview } from "@/lib/services/price-review";
import { ApplyCorrection } from "./ApplyCorrection";

export const metadata = { title: "Écarts de prix" };

const pct = (bp: number) => `${bp > 0 ? "+" : ""}${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const TONE = { hausse: "text-danger", baisse: "text-accent", conforme: "text-success" } as const;

export default async function PriceReviewPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "costs")) notFound();
  const { items, labor, finishedJobs } = await priceReview(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const toFix = items.filter((i) => i.suggestedCost4 != null);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Écarts de prix"
        back={{ href: "/app/catalogue", label: "Catalogue" }}
        subtitle={`Coût prévu au devis comparé au coût réel sur ${finishedJobs} chantier${finishedJobs > 1 ? "s" : ""} terminé${finishedJobs > 1 ? "s" : ""}, pour corriger le catalogue avant les prochains devis.`}
      />
      <div className="space-y-6">
        {labor && labor.action !== "conforme" ? (
          <Notice tone="warning" title={labor.action === "hausse" ? "Main-d'oeuvre sous-estimée" : "Main-d'oeuvre surestimée"}>
            Sur {labor.jobs} chantier{labor.jobs > 1 ? "s" : ""}, les heures pointées ont coûté {formatEuros(labor.realCents)} pour{" "}
            {formatEuros(labor.plannedCents)} prévus ({pct(labor.gapBp)}). Revoyez les temps unitaires des prestations de pose.
          </Notice>
        ) : labor ? (
          <Notice tone="success" title="Main-d'oeuvre conforme">
            Sur {labor.jobs} chantier{labor.jobs > 1 ? "s" : ""}, les heures pointées restent dans les {TOLERANCE_BP / 100} % du prévu.
          </Notice>
        ) : null}
        {items.length ? (
          <Section
            title="Articles du catalogue"
            description={`${toFix.length} article${toFix.length > 1 ? "s" : ""} à corriger : écart de plus de ${TOLERANCE_BP / 100} % entre le coût constaté et le coût du catalogue.`}
          >
            <ul className="divide-y divide-line text-sm" data-testid="ecarts">
              {items.map((i) => (
                <li key={i.itemId} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link className="link font-medium" href={`/app/catalogue/${i.itemId}`}>
                        {i.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {i.reference}, {CONFIDENCE[i.confidence]} : {i.jobTitles.join(", ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-medium ${TONE[i.action]}`}>{REVIEW_ACTIONS[i.action]}</p>
                      <p className="tabular">
                        Prévu {formatEuros(i.plannedCents)}, réel {formatEuros(i.realCents)} ({pct(i.gapBp)})
                      </p>
                      {i.observedCost4 != null ? (
                        <p className="text-xs text-muted tabular">
                          Coût du catalogue {i.costCents != null ? formatEuros(i.costCents) : "non renseigné"}, constaté{" "}
                          {formatEuros(Math.round(i.observedCost4 / 100))} / {i.unit}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {canEdit && i.suggestedCost4 != null && i.costCents != null ? <ApplyCorrection itemId={i.itemId} /> : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Empty icon="chart" title="Pas encore d'écart à analyser">
            L&apos;analyse porte sur les chantiers terminés dont les achats sont affectés aux lignes du devis venues du catalogue. Affectez vos achats aux
            tâches depuis la fiche du chantier.
          </Empty>
        )}
      </div>
    </div>
  );
}
