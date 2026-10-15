import Link from "next/link";
import { trustDisplayAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { myTrustScore } from "@/lib/services/trust-score";
import { MIN_VERIFIED_JOBS, nextSteps } from "@/lib/trust-score";

export const metadata = { title: "Note de confiance" };

/** Note de confiance : calculée sur les chantiers réceptionnés, détaillée critère par critère. */
export default async function TrustPage() {
  const ctx = await requirePageCtx();
  const t = await myTrustScore(ctx);
  const canEdit = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  const steps = nextSteps(t);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Note de confiance"
        subtitle="Calculée uniquement sur des chantiers vérifiés : procès-verbal de réception signé, réserves, délais et avis des clients de ces chantiers."
        back={{ href: "/app/entreprise?onglet=vitrine", label: "Entreprise" }}
        actions={
          <Link href="/app/entreprise/engagements" className="btn-secondary">
            <Icon name="check" size={16} /> Engagements vérifiés
          </Link>
        }
      />
      <section className="card flex flex-wrap items-center gap-6 p-6" aria-labelledby="nc-score">
        <div className="text-center">
          <p id="nc-score" className="text-5xl font-semibold tabular-nums" data-testid="note-confiance-score">
            {t.score == null ? "--" : t.score}
          </p>
          <p className="text-sm text-muted">sur 100</p>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-lg font-semibold">{t.levelLabel}</p>
          <p className="text-sm text-muted">
            {t.score == null
              ? `La note apparaît à partir de ${MIN_VERIFIED_JOBS} chantiers réceptionnés avec procès-verbal signé dans l'application (vous en avez ${t.verifiedJobs}).`
              : `Fondée sur ${t.verifiedJobs} chantiers réceptionnés. Elle se met à jour à chaque réception, réserve levée et avis déposé.`}
          </p>
        </div>
      </section>

      <section className="card p-4" aria-labelledby="nc-criteres">
        <h2 id="nc-criteres" className="mb-3 font-semibold">
          Détail des critères
        </h2>
        <ul className="divide-y divide-line">
          {t.criteria.map((c) => (
            <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-medium">{c.label}</p>
                <p className="text-sm text-muted">{c.detail}</p>
              </div>
              <p className="tabular-nums">
                {c.points} / {c.max}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {steps.length ? (
        <section className="card p-4" aria-labelledby="nc-progres">
          <h2 id="nc-progres" className="mb-2 flex items-center gap-2 font-semibold">
            <Icon name="up" size={18} /> Pour progresser
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card space-y-3 p-4" aria-labelledby="nc-vitrine">
        <h2 id="nc-vitrine" className="font-semibold">
          Affichage sur la vitrine
        </h2>
        {t.showcase ? (
          <>
            <p className="text-sm">
              {t.shown ? "La note est affichée sur votre vitrine" : "La note n'est pas affichée sur votre vitrine"}
              {t.shown && t.score == null ? ", elle apparaîtra dès qu'elle sera calculable." : "."}
            </p>
            {canEdit ? (
              <ActionForm action={trustDisplayAction}>
                <input type="hidden" name="shown" value={t.shown ? "0" : "1"} />
                <Submit className={t.shown ? "btn-secondary" : "btn-primary"}>{t.shown ? "Retirer de la vitrine" : "Afficher sur la vitrine"}</Submit>
              </ActionForm>
            ) : null}
          </>
        ) : (
          <Notice tone="info" title="Pas encore de vitrine">
            Créez votre vitrine dans Entreprise, onglet Vitrine, pour pouvoir y afficher la note.
          </Notice>
        )}
      </section>
    </div>
  );
}
