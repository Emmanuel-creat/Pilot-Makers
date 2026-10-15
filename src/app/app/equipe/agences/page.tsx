import Link from "next/link";
import { agencyAssignAction, agencyCreateAction, agencyDeleteAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { agencyActivity, listAgencies } from "@/lib/services/agencies";
import { can } from "@/lib/services/context";
import { listMembers } from "@/lib/services/team";

export const metadata = { title: "Agences" };

/** Agences : de l'artisan seul à l'entreprise à plusieurs établissements, sans changer d'outil. */
export default async function AgenciesPage() {
  const ctx = await requirePageCtx();
  const [agencies, activity, members, links] = await Promise.all([
    listAgencies(ctx),
    agencyActivity(ctx),
    listMembers(ctx),
    ctx.db.query<{ user_id: string; agency_id: string | null }>("SELECT user_id, agency_id FROM memberships WHERE org_id=$1", [ctx.orgId]),
  ]);
  const edit = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  const agencyOf = (userId: string) => links.find((l) => l.user_id === userId)?.agency_id ?? "";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Agences"
        back={{ href: "/app/equipe", label: "Équipe" }}
        subtitle="Pour les entreprises à plusieurs établissements : chaque membre est rattaché à une agence, ses devis aussi, et l'activité se compare d'une agence à l'autre. Sans agence, rien ne change."
      />
      {agencies.length ? (
        <Section title="Activité des douze derniers mois">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="activite-agences">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2 pr-3">Agence</th>
                  <th className="py-2 pr-3 text-right">Membres</th>
                  <th className="py-2 pr-3 text-right">Devis émis</th>
                  <th className="py-2 pr-3 text-right">Acceptés</th>
                  <th className="py-2 pr-3 text-right">Transformation</th>
                  {can(ctx, "billing") ? <th className="py-2 text-right">Montant accepté HT</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activity.map((a) => (
                  <tr key={a.id ?? "aucune"}>
                    <td className="py-2 pr-3">
                      <Link href={`/app/devis?agence=${a.id ?? "aucune"}`} className="link">
                        {a.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.members}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.issued}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.accepted}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.rate == null ? "--" : `${a.rate} %`}</td>
                    {a.acceptedHtCents != null ? <td className="py-2 text-right tabular-nums">{formatEuros(a.acceptedHtCents)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <Empty icon="building" title="Aucune agence : l'entreprise fonctionne comme un seul établissement." />
      )}

      {agencies.length ? (
        <Section title="Membres et agences">
          <ul className="divide-y divide-line text-sm">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{m.name || m.email}</span>
                  <span className="block text-muted">{m.email}</span>
                </span>
                {edit ? (
                  <ActionForm action={agencyAssignAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={m.user_id} />
                    <label className="sr-only" htmlFor={`ag-${m.user_id}`}>
                      Agence de {m.name || m.email}
                    </label>
                    <select id={`ag-${m.user_id}`} name="agencyId" className="field" defaultValue={agencyOf(m.user_id)}>
                      <option value="">Sans agence</option>
                      {agencies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Submit className="btn-secondary min-h-9">Rattacher</Submit>
                  </ActionForm>
                ) : (
                  <span className="text-muted">{agencies.find((a) => a.id === agencyOf(m.user_id))?.name ?? "Sans agence"}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Établissements">
        {agencies.length ? (
          <ul className="mb-4 divide-y divide-line text-sm">
            {agencies.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium">{a.name}</span>
                  <span className="block text-muted">
                    {[a.city, a.siret ? `SIRET ${a.siret}` : "", `${a.members} membre${a.members > 1 ? "s" : ""}`].filter(Boolean).join(", ")}
                  </span>
                </span>
                {edit ? (
                  <ActionForm action={agencyDeleteAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Submit className="btn-ghost min-h-9">Supprimer</Submit>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {edit ? (
          <ActionForm action={agencyCreateAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ag-name">
                Nom de l&apos;agence
              </label>
              <input id="ag-name" name="name" className="field" required minLength={2} maxLength={80} placeholder="Agence de Villeurbanne" />
            </div>
            <div>
              <label className="label" htmlFor="ag-city">
                Ville
              </label>
              <input id="ag-city" name="city" className="field" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="ag-siret">
                SIRET (facultatif)
              </label>
              <input id="ag-siret" name="siret" className="field" inputMode="numeric" maxLength={17} />
            </div>
            <div className="sm:col-span-4">
              <Submit>Créer l&apos;agence</Submit>
            </div>
          </ActionForm>
        ) : null}
      </Section>
    </div>
  );
}
