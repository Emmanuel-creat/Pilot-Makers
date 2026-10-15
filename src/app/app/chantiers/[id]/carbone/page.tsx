import Link from "next/link";
import { jobCarbonAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section } from "@/components/ui";
import { formatCarbon } from "@/lib/carbon";
import { carKmEquivalent, VEHICLES } from "@/lib/job-carbon";
import { requirePageCtx } from "@/lib/server/session";
import { jobCarbonReport } from "@/lib/services/job-carbon";

export const metadata = { title: "Bilan carbone du chantier" };

/** Empreinte du chantier par poste et leviers pour la réduire. */
export default async function JobCarbonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const r = await jobCarbonReport(ctx, id);
  const posts = [
    { key: "materials", label: "Produits posés", grams: r.materials.grams, share: r.materials.share, tone: "bg-accent" },
    { key: "travel", label: "Déplacements", grams: r.travel.grams, share: r.travel.share, tone: "bg-warning" },
    { key: "waste", label: "Déchets évacués", grams: r.waste.grams, share: r.waste.share, tone: "bg-muted" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Bilan carbone du chantier"
        subtitle={`${r.job.title} : produits du devis accepté, déplacements de l'équipe et déchets évacués.`}
        back={{ href: `/app/chantiers/${r.job.id}`, label: "Chantier" }}
      />
      <Section
        title={`Total : ${formatCarbon(r.totalGrams)}`}
        description={r.totalGrams ? `Autant que ${carKmEquivalent(r.totalGrams).toLocaleString("fr-FR")} km en voiture thermique.` : undefined}
      >
        <ul className="space-y-3 text-sm" data-testid="carbone-postes">
          {posts.map((p) => (
            <li key={p.key} className="space-y-1">
              <div className="flex justify-between gap-3">
                <span>{p.label}</span>
                <span className="tabular font-medium">
                  {formatCarbon(p.grams)} ({p.share} %)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className={`h-full ${p.tone}`} style={{ width: `${p.share}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {r.materials.estimatedGrams ? (
          <p className="mt-3 text-xs text-muted">
            {formatCarbon(r.materials.estimatedGrams)} des produits viennent d&apos;ordres de grandeur : renseignez la fiche environnementale dans le catalogue
            pour préciser.
          </p>
        ) : null}
        {r.waste.unknownVolume ? <p className="mt-1 text-xs text-muted">Les déchets comptés en m³ ne sont pas inclus : indiquez leur poids.</p> : null}
        {!r.job.quoteId ? <p className="mt-1 text-xs text-muted">Ce chantier n&apos;est pas issu d&apos;un devis : les produits ne sont pas comptés.</p> : null}
      </Section>
      {r.levers.length ? (
        <Section title="Pour réduire" description="Économies estimées sur ce chantier.">
          <ul className="space-y-2 text-sm" data-testid="carbone-leviers">
            {r.levers.map((l) => (
              <li key={l.key} className="flex justify-between gap-3">
                <span>
                  {l.key === "biosource" && r.job.quoteId ? (
                    <Link href={`/app/devis/${r.job.quoteId}/biosource`} className="link">
                      {l.label}
                    </Link>
                  ) : (
                    l.label
                  )}
                </span>
                <span className="tabular shrink-0 text-success">- {formatCarbon(l.savingGrams)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section
        title="Déplacements"
        description={`Allers-retours : ${r.settings.trips ?? r.settings.autoTrips}${r.settings.trips == null ? `, d'après ${r.settings.tripsSource === "pointage" ? "les jours pointés" : "le planning"}` : ""}. Distance parcourue : ${r.travel.km.toLocaleString("fr-FR")} km.`}
      >
        {r.settings.tripKm == null ? (
          <Notice tone="info">Indiquez la distance aller-retour entre le dépôt et le chantier pour compter les déplacements.</Notice>
        ) : null}
        <ActionForm action={jobCarbonAction} className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="jobId" value={r.job.id} />
          <div>
            <label className="label" htmlFor="cc-km">
              Aller-retour, en km
            </label>
            <input id="cc-km" name="tripKm" className="field" inputMode="decimal" defaultValue={r.settings.tripKm == null ? "" : String(r.settings.tripKm)} />
          </div>
          <div>
            <label className="label" htmlFor="cc-vehicle">
              Véhicule
            </label>
            <select id="cc-vehicle" name="vehicle" className="field" defaultValue={r.settings.vehicle}>
              {Object.entries(VEHICLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cc-trips">
              Allers-retours (vide : automatique)
            </label>
            <input id="cc-trips" name="trips" className="field" inputMode="numeric" defaultValue={r.settings.trips == null ? "" : String(r.settings.trips)} />
          </div>
          <Submit className="btn-secondary">Enregistrer</Submit>
        </ActionForm>
      </Section>
      <p className="text-xs text-muted">
        Ordres de grandeur indicatifs (véhicules : base Empreinte de l&apos;ADEME ; déchets : estimations prudentes) : ce bilan sert à comparer et à réduire,
        pas à déclarer.
      </p>
    </div>
  );
}
