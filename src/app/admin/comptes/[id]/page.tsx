import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { num } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { requireAdminPage } from "@/lib/server/session";
import { accountDetail } from "@/lib/services/admin";
import { adminFeatureAction, adminResetAction, supportAccessAction, suspendAction } from "@/app/actions";
import { featureStates } from "@/lib/features";

export const metadata = { title: "Compte" };

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdminPage();
  const d = await accountDetail(ctx, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const suspended = d.org.status === "suspended";
  const sub = d.subscription;
  return (
    <>
      <PageHeader title={String(d.org.trade_name || "(sans nom)")} back={{ href: "/admin/comptes", label: "Comptes" }} subtitle={`Créé le ${fmtDate(d.org.created_at as Date)}`} />
      {suspended ? (
        <div className="mb-4">
          <Notice tone="danger" title="Compte suspendu">
            {String(d.org.suspended_reason ?? "")}
          </Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Abonnement">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Offre souscrite</dt>
              <dd>
                {String(sub?.plan_code ?? "-")} ({String(sub?.status ?? "-")})
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Offre appliquée</dt>
              <dd>{d.entitlements.plan.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Fin de période</dt>
              <dd>{fmtDate((sub?.current_period_end ?? sub?.trial_end) as Date | null) || "-"}</dd>
            </div>
            {d.usage.map((u) => (
              <div key={u.kind} className="flex justify-between">
                <dt className="text-muted">Consommation {u.kind} (mois)</dt>
                <dd>
                  {u.units} ({formatEuros(Math.round(u.costMicroEur / 10_000))})
                </dd>
              </div>
            ))}
          </dl>
          {d.invoices.length ? (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {d.invoices.map((i) => (
                <li key={String(i.number)}>
                  {String(i.number)} - {formatEuros(num(i.amount_ttc_cents))} - {String(i.status)}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
        <Section title="Membres">
          <ul className="divide-y divide-line text-sm">
            {d.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">
                    {m.name} <span className="text-xs text-muted">({m.role})</span>
                  </div>
                  <div className="text-xs text-muted">
                    {m.email}, {m.email_verified_at ? "e-mail vérifié" : "e-mail non vérifié"}, {m.status}
                  </div>
                </div>
                <form action={adminResetAction}>
                  <input type="hidden" name="userId" value={m.id} />
                  <input type="hidden" name="orgId" value={id} />
                  <button className="btn-ghost min-h-8 text-xs">Envoyer une réinitialisation</button>
                </form>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Fonctionnalités" description="Activation progressive : forcer une nouveauté pour ce compte, ou la laisser suivre le déploiement général.">
          <ul className="divide-y divide-line text-sm">
            {featureStates({ id, feature_flags: d.org.feature_flags }).map((f) => (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">
                    {f.label} <span className={`text-xs ${f.enabled ? "text-success" : "text-muted"}`}>{f.enabled ? "active" : "inactive"}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {f.override ? `Forcée (${f.override === "on" ? "activée" : "désactivée"})` : `Déploiement ${f.percent} %, groupe ${f.bucket}`}
                  </div>
                </div>
                <ActionForm action={adminFeatureAction} className="flex gap-1">
                  <input type="hidden" name="orgId" value={id} />
                  <input type="hidden" name="key" value={f.key} />
                  {(["auto", "on", "off"] as const).map((v) => (
                    <button key={v} name="value" value={v} className="btn-secondary min-h-8 py-1" aria-pressed={(f.override ?? "auto") === v}>
                      {v === "auto" ? "Auto" : v === "on" ? "Activer" : "Désactiver"}
                    </button>
                  ))}
                </ActionForm>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Accès support" description="Accès temporaire en lecture seule à l'espace du client, avec motif obligatoire et journalisé.">
          <ActionForm action={supportAccessAction}>
            <input type="hidden" name="orgId" value={id} />
            <div>
              <label className="label" htmlFor="sa-reason">
                Motif
              </label>
              <input id="sa-reason" name="reason" className="field" required minLength={10} placeholder="Ex. : demande d'assistance du 12/10 sur un PDF" />
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="label" htmlFor="sa-min">
                  Durée (minutes)
                </label>
                <input id="sa-min" name="minutes" type="number" min={5} max={60} defaultValue={30} className="field w-28" />
              </div>
              <Submit className="btn-secondary">Ouvrir l'accès</Submit>
            </div>
          </ActionForm>
        </Section>
        <Section title={suspended ? "Réactiver le compte" : "Suspendre le compte"} description="La suspension passe le compte en lecture seule. Aucune donnée n'est supprimée et l'export reste possible.">
          <ActionForm action={suspendAction}>
            <input type="hidden" name="orgId" value={id} />
            <input type="hidden" name="suspend" value={suspended ? "0" : "1"} />
            {!suspended ? (
              <div>
                <label className="label" htmlFor="su-reason">
                  Motif
                </label>
                <input id="su-reason" name="reason" className="field" required minLength={10} />
              </div>
            ) : null}
            <Submit className={suspended ? "btn-secondary" : "btn-danger"}>{suspended ? "Réactiver" : "Suspendre"}</Submit>
          </ActionForm>
        </Section>
        <Section title="Activité récente">
          <ul className="space-y-1 text-xs">
            {d.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{e.action}</span>
                <span className="text-muted">{fmtDate(e.created_at, true)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Erreurs">
          {d.errors.length === 0 ? <p className="text-sm text-muted">Aucune erreur.</p> : null}
          <ul className="space-y-2 text-xs">
            {d.errors.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.kind}</span> <span className="text-muted">{fmtDate(e.created_at, true)}</span>
                <div className="text-muted">{e.message}</div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
