import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { planningDefaults, proposeForJob } from "@/lib/services/auto-planning";
import { getJob } from "@/lib/services/jobs";
import { ApplyProposal } from "./ApplyProposal";

export const metadata = { title: "Planifier automatiquement" };

type Sp = { jours?: string; equipe?: string; competence?: string; debut?: string };

export default async function AutoPlanningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const { job } = await getJob(ctx, id).catch(() => notFound());
  const sp = await searchParams;
  const defaults = await planningDefaults(ctx, id);
  const need = {
    days: sp.jours ?? String(defaults.days),
    crew: sp.equipe ?? String(defaults.crew),
    skill: sp.competence ?? defaults.skill,
    from: sp.debut ?? defaults.from,
  };
  let result: Awaited<ReturnType<typeof proposeForJob>> | null = null;
  let error = "";
  try {
    result = await proposeForJob(ctx, id, need);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) error = e.message;
    else throw e;
  }
  const p = result?.proposal;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Planifier automatiquement"
        back={{ href: `/app/chantiers/${id}`, label: String(job.title) }}
        subtitle="La première période où assez de personnes compétentes sont libres, hors week-ends, jours fériés et absences."
      />
      <div className="space-y-6">
        <Section
          title="Besoin du chantier"
          description={
            sp.jours
              ? undefined
              : `Durée et équipe estimées d'après la main-d'oeuvre du devis accepté, à ajuster.${defaults.lead ? ` Démarrage au plus tôt après le délai d'approvisionnement de « ${defaults.lead.label} » (${defaults.lead.days} jours ouvrés).` : ""}`
          }
        >
          <form className="grid gap-3 sm:grid-cols-4 sm:items-end" action={`/app/chantiers/${id}/planifier`}>
            <div>
              <label className="label" htmlFor="ap-days">
                Jours ouvrés
              </label>
              <input id="ap-days" name="jours" type="number" min={1} max={60} className="field tabular" defaultValue={need.days} />
            </div>
            <div>
              <label className="label" htmlFor="ap-crew">
                Personnes
              </label>
              <input id="ap-crew" name="equipe" type="number" min={1} max={10} className="field tabular" defaultValue={need.crew} />
            </div>
            <div>
              <label className="label" htmlFor="ap-skill">
                Compétence requise
              </label>
              <input id="ap-skill" name="competence" className="field" maxLength={80} defaultValue={need.skill} placeholder="Ex. : carreleur" />
            </div>
            <div>
              <label className="label" htmlFor="ap-from">
                Au plus tôt le
              </label>
              <input id="ap-from" name="debut" type="date" className="field" defaultValue={need.from} />
            </div>
            <div className="sm:col-span-4">
              <button className="btn-secondary">Chercher une période</button>
            </div>
          </form>
        </Section>
        {error ? <Notice tone="warning">{error}</Notice> : null}
        {result && !p ? (
          <Notice tone="warning" title="Aucune période trouvée sur trois mois">
            Pas assez de personnes {need.skill ? `ayant la compétence « ${need.skill} » ` : ""}libres en même temps. Réduisez l&apos;équipe ou la durée, ou
            vérifiez les qualifications dans Équipe.
          </Notice>
        ) : null}
        {p ? (
          <Section
            title={`Du ${fmtDate(p.start)} au ${fmtDate(p.end)}`}
            description={`${p.days.length} jour${p.days.length > 1 ? "s" : ""} ouvré${p.days.length > 1 ? "s" : ""}.`}
          >
            <ul className="mb-4 divide-y divide-line text-sm" data-testid="proposition-planning">
              {p.crew.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 py-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted">{c.km == null ? "distance inconnue" : `à ${c.km} km du chantier`}</span>
                </li>
              ))}
            </ul>
            {p.skipped ? (
              <p className="mb-3 text-sm text-muted">
                {p.skipped} autre{p.skipped > 1 ? "s" : ""} personne{p.skipped > 1 ? "s" : ""} compétente{p.skipped > 1 ? "s" : ""} déjà prise
                {p.skipped > 1 ? "s" : ""} sur cette période.
              </p>
            ) : null}
            {!result?.located ? <p className="mb-3 text-sm text-muted">Localisez le chantier pour départager les personnes selon la distance.</p> : null}
            {writable ? <ApplyProposal jobId={id} start={p.start} end={p.end} userIds={p.crew.map((c) => c.id)} /> : null}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
