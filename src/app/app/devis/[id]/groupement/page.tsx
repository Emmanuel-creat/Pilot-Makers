import { notFound } from "next/navigation";
import { consortiumCreateAction, consortiumLotAction, consortiumMemberAction, consortiumRemoveAction } from "@/app/actions";
import { PrintButton } from "@/app/app/rapports/ReportActions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section } from "@/components/ui";
import { formatEuros, formatPercent } from "@/lib/calc/format";
import { CONSORTIUM_FORMS, MEMBER_STATUSES } from "@/lib/consortium";
import { requirePageCtx } from "@/lib/server/session";
import { quoteConsortium } from "@/lib/services/consortia";

export const metadata = { title: "Groupement d'entreprises" };

export default async function ConsortiumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const v = await quoteConsortium(ctx, id).catch(() => null);
  if (!v) notFound();
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const c = v.consortium;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Groupement d'entreprises"
        back={{ href: `/app/devis/${id}`, label: v.quote.number ?? "Devis" }}
        subtitle={`${v.quote.title || "Devis"} : répondez à plusieurs à un gros chantier, chacun sur ses lots, avec un mandataire.`}
        actions={c ? <PrintButton /> : null}
      />
      {!c ? (
        writable ? (
          <Section title="Constituer un groupement">
            <ActionForm action={consortiumCreateAction} className="space-y-3">
              <input type="hidden" name="quoteId" value={id} />
              <fieldset className="space-y-2">
                <legend className="label">Forme du groupement</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="form" value="conjoint" defaultChecked className="mt-1" />
                  <span>
                    <span className="font-medium">Conjoint</span> : chaque entreprise s&apos;engage sur ses lots et est payée directement.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="form" value="solidaire" className="mt-1" />
                  <span>
                    <span className="font-medium">Solidaire</span> : chaque entreprise répond de la totalité du marché, paiement sur un compte unique.
                  </span>
                </label>
              </fieldset>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="mandataireSolidaire" defaultChecked />
                En groupement conjoint, le mandataire est solidaire des autres membres (souvent exigé par l&apos;acheteur public)
              </label>
              <Submit className="btn-primary">Créer le groupement</Submit>
            </ActionForm>
          </Section>
        ) : (
          <Notice tone="info">Aucun groupement sur ce devis.</Notice>
        )
      ) : (
        <div className="space-y-6">
          {c.issues.length ? (
            <Notice tone="warning" title="À régler avant de déposer l'offre">
              <ul className="list-disc pl-5">
                {c.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Notice>
          ) : (
            <Notice tone="success" title="Groupement complet">
              Tous les lots ont une entreprise et chaque cotraitant a accepté.
            </Notice>
          )}
          <Section title={`${CONSORTIUM_FORMS[c.form]} : répartition`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="repartition-groupement">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2 pr-3 font-normal">Entreprise</th>
                    <th className="py-2 pr-3 font-normal">Lots</th>
                    <th className="py-2 pr-3 text-right font-normal">Montant HT</th>
                    <th className="py-2 text-right font-normal">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {c.shares.map((s) => {
                    const m = c.members.find((x) => x.id === s.memberId)!;
                    return (
                      <tr key={s.memberId} className="border-t border-line align-top">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-xs text-muted">
                            {[MEMBER_STATUSES[m.status], m.trade, m.siret ? `SIRET ${m.siret}` : ""].filter(Boolean).join(", ")}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{s.lots.join(", ") || "Aucun"}</td>
                        <td className="py-2 pr-3 text-right tabular">{formatEuros(s.amountCents)}</td>
                        <td className="py-2 text-right tabular">{formatPercent(s.shareBp)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-line font-semibold">
                    <td className="py-2 pr-3" colSpan={2}>
                      Total du marché HT
                    </td>
                    <td className="py-2 pr-3 text-right tabular">{formatEuros(v.totalHtCents)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
          {writable ? (
            <div className="grid gap-6 print:hidden md:grid-cols-2">
              <Section title="Attribuer les lots">
                <ul className="space-y-2">
                  {v.sections.map((sec, i) => {
                    const owner = c.members.find((m) => m.sectionIds.includes(sec.id));
                    return (
                      <li key={sec.id}>
                        <ActionForm action={consortiumLotAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="consortiumId" value={c.id} />
                          <input type="hidden" name="sectionId" value={sec.id} />
                          <div className="min-w-0 flex-1">
                            <label className="label" htmlFor={`lot-${i}`}>
                              {sec.title || `Lot ${i + 1}`} ({formatEuros(sec.subtotalCents)} HT)
                            </label>
                            <select id={`lot-${i}`} name="memberId" className="field" defaultValue={owner?.id ?? ""}>
                              {c.members
                                .filter((m) => m.status !== "refuse")
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <Submit className="btn-secondary">Attribuer</Submit>
                        </ActionForm>
                      </li>
                    );
                  })}
                </ul>
              </Section>
              <Section title="Cotraitants">
                <ul className="mb-4 space-y-2 text-sm">
                  {c.members
                    .filter((m) => m.status !== "mandataire")
                    .map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span>
                          {m.name} <span className="text-muted">({MEMBER_STATUSES[m.status].toLowerCase()})</span>
                        </span>
                        <ActionForm action={consortiumRemoveAction}>
                          <input type="hidden" name="consortiumId" value={c.id} />
                          <input type="hidden" name="memberId" value={m.id} />
                          <Submit className="btn-ghost text-xs">Retirer</Submit>
                        </ActionForm>
                      </li>
                    ))}
                </ul>
                {v.candidates.length ? (
                  <ActionForm action={consortiumMemberAction} className="mb-4 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="consortiumId" value={c.id} />
                    <div className="min-w-0 flex-1">
                      <label className="label" htmlFor="gme-peer">
                        Confrère de vos réseaux
                      </label>
                      <select id="gme-peer" name="orgId" className="field">
                        {v.candidates.map((p) => (
                          <option key={p.org_id} value={p.org_id}>
                            {p.name}
                            {p.trade ? `, ${p.trade}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Submit className="btn-secondary">Inviter</Submit>
                  </ActionForm>
                ) : null}
                <ActionForm action={consortiumMemberAction} resetOnSuccess className="space-y-2">
                  <input type="hidden" name="consortiumId" value={c.id} />
                  <p className="text-sm font-medium">Entreprise extérieure</p>
                  <div>
                    <label className="label" htmlFor="gme-name">
                      Raison sociale
                    </label>
                    <input id="gme-name" name="name" className="field" maxLength={160} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label" htmlFor="gme-siret">
                        SIRET
                      </label>
                      <input id="gme-siret" name="siret" className="field" inputMode="numeric" maxLength={17} />
                    </div>
                    <div>
                      <label className="label" htmlFor="gme-trade">
                        Métier
                      </label>
                      <input id="gme-trade" name="trade" className="field" maxLength={120} />
                    </div>
                  </div>
                  <Submit className="btn-secondary">Ajouter</Submit>
                </ActionForm>
              </Section>
            </div>
          ) : null}
          <Section title="Convention de groupement">
            <ol className="list-decimal space-y-2 pl-5 text-sm" data-testid="convention-groupement">
              {c.clauses.map((cl) => (
                <li key={cl}>{cl}</li>
              ))}
            </ol>
            <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
              {c.members
                .filter((m) => m.status !== "refuse")
                .map((m) => (
                  <div key={m.id} className="border-t border-line pt-2">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-muted">Date, nom du signataire et signature</p>
                    <div className="h-16" />
                  </div>
                ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
