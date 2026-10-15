import Link from "next/link";
import { commitmentsAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader } from "@/components/ui";
import { COMMITMENTS, MIN_CASES, publicSentence } from "@/lib/commitments";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { myCommitments } from "@/lib/services/commitments";

export const metadata = { title: "Engagements vérifiés" };

/** Engagements vérifiés : des promesses simples, mesurées sur les documents réels et publiées avec leur taux. */
export default async function CommitmentsPage() {
  const ctx = await requirePageCtx();
  const c = await myCommitments(ctx);
  const canEdit = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess && c.hasShowcase;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Engagements vérifiés"
        subtitle="Choisissez les promesses faites à vos clients. L'application vérifie chacune sur vos devis et factures des douze derniers mois, et la vitrine affiche le taux mesuré, tenu ou non."
        back={{ href: "/app/entreprise/confiance", label: "Note de confiance" }}
      />
      {!c.hasShowcase ? (
        <Notice tone="info" title="Pas encore de vitrine">
          Créez votre vitrine dans Entreprise, onglet Vitrine, pour pouvoir y publier vos engagements.
        </Notice>
      ) : null}
      <ActionForm action={commitmentsAction} className="space-y-4">
        <ul className="space-y-3">
          {c.measures.map((m) => (
            <li key={m.key} className="card p-4" data-testid={`engagement-${m.key}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input type="checkbox" name="key" value={m.key} defaultChecked={c.chosen.includes(m.key)} disabled={!canEdit} className="mt-1 size-4" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block text-sm">{m.promise}</span>
                    <span className="block text-xs text-muted">Mesure : {COMMITMENTS[m.key].measure}</span>
                  </span>
                </label>
                <p className="text-right">
                  <span className="block text-2xl font-semibold tabular-nums">{m.rate == null ? "--" : `${m.rate} %`}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {m.kept} sur {m.cases} cas
                  </span>
                </p>
              </div>
              <p className="mt-2 text-sm text-muted">{publicSentence(m)}</p>
              {m.missed.length ? (
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <Icon name="alert" size={16} className="mt-0.5 text-warning" />
                  <span>
                    Non tenu sur : {m.missed.slice(0, 10).join(", ")}
                    {m.missed.length > 10 ? ` et ${m.missed.length - 10} autres` : ""}. Ces numéros ne sont jamais publiés.
                  </span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? <Submit>Publier la sélection sur ma vitrine</Submit> : null}
      </ActionForm>
      <p className="text-sm text-muted">
        Aucun taux n&apos;est publié sous {MIN_CASES} cas. Retirer un engagement est toujours possible ; il disparaît alors de la vitrine.{" "}
        <Link href="/aide/engagements-verifies" className="link">
          Comment sont mesurés les engagements
        </Link>
      </p>
    </div>
  );
}
