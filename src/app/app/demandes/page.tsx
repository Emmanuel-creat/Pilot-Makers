import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, Section, StatusBadge, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { LEAD_SOURCES, LEAD_STATUSES, listLeads, OPEN_LEAD_STATUSES, type Lead } from "@/lib/services/leads";
import { cancelVisitAction, convertLeadAction, updateLeadAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { upcomingVisits } from "@/lib/services/visits";
import { slotLabel } from "@/lib/visits";
import { LeadForm } from "./LeadForm";

export const metadata = { title: "Demandes" };

function parisToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tout?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const [all, visits] = await Promise.all([listLeads(ctx), upcomingVisits(ctx)]);
  const open = all.filter((l) => OPEN_LEAD_STATUSES.includes(l.status));
  const closed = all.filter((l) => !OPEN_LEAD_STATUSES.includes(l.status));
  const today = parisToday();
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const won = closed.filter((l) => l.status === "gagnee").length;
  return (
    <>
      <PageHeader
        title="Demandes"
        subtitle={`${open.length} à suivre${closed.length ? `, ${won} gagnée${won > 1 ? "s" : ""} sur ${closed.length} terminée${closed.length > 1 ? "s" : ""}` : ""}`}
        actions={
          <Link href="/app/demandes/mise-en-relation" className="btn-secondary">
            <Icon name="users" size={16} /> Demandes de particuliers
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {visits.length ? (
            <Section title="Visites à venir" description="Réservées en ligne depuis votre vitrine. Elles figurent aussi dans votre agenda synchronisé.">
              <ul className="divide-y divide-line" data-testid="visites">
                {visits.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Icon name="calendar" size={16} className="text-muted" /> {slotLabel(v.start)}
                      </p>
                      <p>
                        {v.name}, {v.phone}
                        {v.email ? `, ${v.email}` : ""}
                      </p>
                      <p className="text-muted">
                        {v.address}
                        {v.city ? `, ${v.city}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 text-muted">{v.description}</p>
                    </div>
                    {writable ? (
                      <ActionForm action={cancelVisitAction} className="flex flex-col items-end gap-1">
                        <input type="hidden" name="id" value={v.id} />
                        <Submit className="btn-secondary">Annuler la visite</Submit>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {all.length === 0 ? (
            <Empty icon="inbox" title="Aucune demande pour l'instant">
              Notez ici chaque appel ou message d'un client potentiel : vous saurez qui rappeler, quand, et combien de demandes deviennent des chantiers.
            </Empty>
          ) : (
            <Section title="À suivre" description="Classées par date de prochaine action.">
              {open.length === 0 ? <p className="text-sm text-muted">Toutes les demandes sont traitées.</p> : null}
              <ul className="divide-y divide-line">
                {open.map((l) => (
                  <LeadRow key={l.id} l={l} today={today} writable={writable} />
                ))}
              </ul>
            </Section>
          )}
          {closed.length ? (
            <Section title="Terminées">
              <ul className="divide-y divide-line">
                {(sp.tout ? closed : closed.slice(0, 10)).map((l) => (
                  <LeadRow key={l.id} l={l} today={today} writable={writable} />
                ))}
              </ul>
              {!sp.tout && closed.length > 10 ? (
                <Link href="/app/demandes?tout=1" className="link mt-2 inline-block text-sm">
                  Voir les {closed.length} demandes terminées
                </Link>
              ) : null}
            </Section>
          ) : null}
        </div>
        {writable ? (
          <aside>
            <Section title="Nouvelle demande">
              <LeadForm />
            </Section>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function LeadRow({ l, today, writable }: { l: Lead; today: string; writable: boolean }) {
  const late = l.next_action_on && l.next_action_on <= today && OPEN_LEAD_STATUSES.includes(l.status);
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">
            {l.name}
            <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-muted">{LEAD_STATUSES[l.status]}</span>
          </div>
          <div className="text-xs text-muted">
            {[l.phone, l.email, l.city, LEAD_SOURCES[l.source]].filter(Boolean).join(" - ")} - reçue le {fmtDate(l.created_at)}
          </div>
          {l.description ? <p className="mt-1 line-clamp-2 text-muted">{l.description}</p> : null}
          {l.next_action || l.next_action_on ? (
            <p className={`mt-1 flex items-center gap-1.5 ${late ? "font-medium text-danger" : ""}`}>
              <Icon name="clock" size={14} />
              {l.next_action || "Action prévue"}
              {l.next_action_on ? ` le ${fmtDate(l.next_action_on)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {l.quote_id ? (
            <Link href={`/app/devis/${l.quote_id}`} className="link flex items-center gap-1.5">
              {l.quote_number ?? "Devis brouillon"} {l.quote_status ? <StatusBadge status={l.quote_status} /> : null}
            </Link>
          ) : writable ? (
            <form action={convertLeadAction}>
              <input type="hidden" name="id" value={l.id} />
              <button className="btn-secondary min-h-9 text-sm">
                <Icon name="quote" size={16} /> Créer le devis
              </button>
            </form>
          ) : null}
        </div>
      </div>
      {writable ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">Mettre à jour le suivi</summary>
          <form action={updateLeadAction} className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr_150px_auto]">
            <input type="hidden" name="id" value={l.id} />
            <select name="status" defaultValue={l.status} className="field" aria-label="Statut">
              {Object.entries(LEAD_STATUSES).map(([v, lab]) => (
                <option key={v} value={v}>
                  {lab}
                </option>
              ))}
            </select>
            <input
              name="next_action"
              defaultValue={l.next_action}
              className="field"
              placeholder="Prochaine action"
              aria-label="Prochaine action"
              maxLength={300}
            />
            <input name="next_action_on" type="date" defaultValue={l.next_action_on ?? ""} className="field" aria-label="Date de la prochaine action" />
            <button className="btn-secondary">Enregistrer</button>
          </form>
        </details>
      ) : null}
    </li>
  );
}
