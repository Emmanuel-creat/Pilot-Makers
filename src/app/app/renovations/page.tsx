import Link from "next/link";
import { renovationCreateAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { TRADES } from "@/lib/coordination";
import { STATUS_LABELS } from "@/lib/renovation";
import { requirePageCtx } from "@/lib/server/session";
import { customerDisplayName, searchCustomers } from "@/lib/services/customers";
import { listRenovations } from "@/lib/services/renovation";

export const metadata = { title: "Rénovations coordonnées" };

/** Dossiers de rénovation coordonnée : pilotés par l'entreprise ou auxquels elle participe. */
export default async function RenovationsPage() {
  const ctx = await requirePageCtx();
  const [list, customers] = await Promise.all([listRenovations(ctx), searchCustomers(ctx, { limit: 500 })]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Rénovations coordonnées"
        subtitle="Un client, un dossier, plusieurs artisans, un seul pilote. Chaque entreprise garde son devis ; le client suit tout au même endroit."
      />
      {canEdit ? (
        <section className="card p-4" aria-labelledby="rc-nouveau">
          <h2 id="rc-nouveau" className="mb-3 font-semibold">
            Piloter un nouveau dossier
          </h2>
          <ActionForm action={renovationCreateAction} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rc-client">
                Client
              </label>
              <select id="rc-client" name="customerId" className="field" required defaultValue="">
                <option value="" disabled>
                  Choisir
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerDisplayName(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rc-titre">
                Intitulé du dossier
              </label>
              <input id="rc-titre" name="title" className="field" required minLength={3} maxLength={160} placeholder="Rénovation complète maison Bernard" />
            </div>
            <div>
              <label className="label" htmlFor="rc-lot">
                Votre lot
              </label>
              <select id="rc-lot" name="trade" className="field" defaultValue="">
                <option value="">Selon votre métier</option>
                {TRADES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Submit>Créer le dossier</Submit>
            </div>
          </ActionForm>
        </section>
      ) : null}
      {list.length ? (
        <ul className="card divide-y divide-line">
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/app/renovations/${r.id}`} className="link font-medium">
                  {r.title}
                </Link>
                <p className="text-sm text-muted">
                  {r.piloted ? `Vous pilotez${r.customer ? `, client ${r.customer}` : ""}` : `Piloté par ${r.pilot}`} ; {r.companies} entreprise
                  {r.companies > 1 ? "s" : ""}
                </p>
              </div>
              <p className="text-sm text-muted">{r.myStatus && !r.piloted ? STATUS_LABELS[r.myStatus] : fmtDate(r.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="team" title="Aucun dossier pour l'instant">
          Créez un dossier pour rassembler les devis de plusieurs entreprises de vos réseaux autour d&apos;un même client.
        </Empty>
      )}
    </div>
  );
}
