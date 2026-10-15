import { homeEntryAddAction, homeEntryDeleteAction, homeShareAction, homeShareRevokeAction } from "@/app/actions";
import { HomeTimeline, frDate } from "@/components/HomeTimeline";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section } from "@/components/ui";
import { ENTRY_KINDS } from "@/lib/home-record";
import { requirePageCtx } from "@/lib/server/session";
import { getHomeRecord } from "@/lib/services/home-records";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Carnet de logement" };

export default async function HomeRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ repris?: string }> }) {
  const { id } = await params;
  const { repris } = await searchParams;
  const ctx = await requirePageCtx();
  const h = await getHomeRecord(ctx, id);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={h.address.line1}
        subtitle={`${h.address.postalCode} ${h.address.city}, logement de ${h.customer}`}
        back={{ href: "/app/carnets", label: "Carnets" }}
      />
      {repris != null ? (
        <Notice tone="success" title="Carnet repris">
          {Number(repris) > 0
            ? `${repris} entrée${Number(repris) > 1 ? "s" : ""} ajoutée${Number(repris) > 1 ? "s" : ""} à l'historique du logement, avec leur auteur.`
            : "L'historique était déjà à jour : aucune nouvelle entrée."}
        </Notice>
      ) : null}
      <div className="space-y-6">
        <Section title="Garanties en cours" description="Garanties légales des chantiers réceptionnés et garanties fabricant des équipements.">
          {h.warranties.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="garanties-logement">
              {h.warranties.map((w, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{w.label}</span> <span className="text-muted">{w.source}</span>
                  </span>
                  <span className="tabular-nums">jusqu&apos;au {frDate(w.end)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune garantie en cours.</p>
          )}
        </Section>

        <Section title="Historique du logement">
          {h.items.length ? (
            <HomeTimeline
              items={h.items}
              action={(it) =>
                it.type === "entree" && writable ? (
                  <ActionForm action={homeEntryDeleteAction}>
                    <input type="hidden" name="id" value={it.entry.id} />
                    <input type="hidden" name="recordId" value={h.id} />
                    <Submit className="btn-secondary">Retirer</Submit>
                  </ActionForm>
                ) : null
              }
            />
          ) : (
            <p className="text-sm text-muted">Rien encore : les chantiers apparaissent dès qu&apos;ils sont datés.</p>
          )}
        </Section>

        {writable ? (
          <Section title="Ajouter au carnet" description="Équipement installé, entretien, diagnostic ou travaux faits par un autre professionnel.">
            <ActionForm action={homeEntryAddAction} resetOnSuccess className="grid gap-3 text-sm sm:grid-cols-2">
              <input type="hidden" name="recordId" value={h.id} />
              <label>
                <span className="mb-1 block font-medium">Type</span>
                <select name="kind" className="field" defaultValue="equipement">
                  {Object.entries(ENTRY_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block font-medium">Date</span>
                <input type="date" name="date" className="field" required defaultValue={parisDate(new Date())} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block font-medium">Intitulé</span>
                <input name="label" className="field" required maxLength={160} placeholder="Chaudière à condensation" />
              </label>
              <label>
                <span className="mb-1 block font-medium">Marque et modèle</span>
                <input name="brand" className="field" maxLength={120} />
              </label>
              <label>
                <span className="mb-1 block font-medium">Garantie fabricant jusqu&apos;au</span>
                <input type="date" name="warrantyUntil" className="field" />
              </label>
              <label>
                <span className="mb-1 block font-medium">Entretien tous les (mois)</span>
                <input type="number" name="maintenanceMonths" className="field" min={1} max={120} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block font-medium">Détails</span>
                <textarea name="detail" className="field min-h-20" maxLength={2000} />
              </label>
              <div className="sm:col-span-2">
                <Submit>Ajouter</Submit>
              </div>
            </ActionForm>
          </Section>
        ) : null}

        <Section
          title="Transmission"
          description="Un lien en lecture seule pour le propriétaire, son notaire ou l'acheteur : adresse, historique et garanties, sans montant ni nom du client."
        >
          <div className="space-y-3 text-sm">
            {h.shared && h.shareExpiresAt ? (
              <p data-testid="partage-carnet">
                Lien actif jusqu&apos;au {frDate(h.shareExpiresAt.slice(0, 10))}, {h.shareViews} consultation{h.shareViews > 1 ? "s" : ""}.
              </p>
            ) : (
              <p className="text-muted">Aucun lien actif.</p>
            )}
            {writable ? (
              <div className="flex flex-wrap gap-3">
                <ActionForm action={homeShareAction}>
                  <input type="hidden" name="recordId" value={h.id} />
                  <input type="hidden" name="days" value="365" />
                  <Submit>{h.shared ? "Remplacer le lien" : "Créer un lien valable un an"}</Submit>
                </ActionForm>
                {h.shared ? (
                  <ActionForm action={homeShareRevokeAction}>
                    <input type="hidden" name="recordId" value={h.id} />
                    <Submit className="btn-secondary">Révoquer le lien</Submit>
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
