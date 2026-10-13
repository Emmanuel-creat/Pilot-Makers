import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, StatusBadge, fmtDate } from "@/components/ui";
import { SnapshotView } from "@/components/SnapshotView";
import { QuoteEditor, type EditorCustomer } from "@/components/editor/QuoteEditor";
import { num } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { EVENT_LABELS } from "@/lib/services/dashboard";
import { customerDisplayName, getCustomer, searchCustomers } from "@/lib/services/customers";
import { getOrganization } from "@/lib/services/organization";
import { readPricing, type Pricing } from "@/lib/services/pricing";
import { EDITABLE_STATUSES, PENDING_STATUSES, QUOTE_STATUSES } from "@/lib/services/quote-types";
import { getDraft, getQuoteRow, getVersion, listAmendments, listVersions, quoteEmails, quoteEvents } from "@/lib/services/quotes";
import { amendQuoteAction, archiveQuoteAction, deleteDraftAction, duplicateQuoteAction, reviseQuoteAction, revokeLinksAction } from "@/app/actions";
import { snapshotOptions } from "@/lib/services/options";
import { CancelQuote, IntegrityCheck, ManualResponse, SendButton, ShareLinkButton } from "./IssuedActions";
import { QuoteBilling } from "./Billing";
import { ClientThread } from "./ClientThread";
import { listQuoteMessages } from "@/lib/services/client-space";
import { CreateJob } from "./CreateJob";
import { SubQuotes } from "@/components/SubQuotes";
import { LANGS } from "@/lib/pdf/i18n";
import { can } from "@/lib/services/context";
import { listSubQuotes } from "@/lib/services/subcontractor-quotes";
import { listSubcontractors } from "@/lib/services/subcontractors";
import { jobForQuote } from "@/lib/services/jobs";
import { listIndexValues } from "@/lib/services/revision";
import { hasFeature } from "@/lib/services/features";
import { INVOICE_KINDS, INVOICE_STATUSES, invoicedProgress, listInvoices } from "@/lib/services/invoices";

export const metadata = { title: "Devis" };

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assistant?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const draft = await getDraft(ctx, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const org = await getOrganization(ctx);
  const customer = draft.customerId ? await getCustomer(ctx, draft.customerId).catch(() => null) : null;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const editable = EDITABLE_STATUSES.includes(draft.status);

  if (editable && writable) {
    const editorCustomer: EditorCustomer | null = customer
      ? {
          id: customer.id,
          type: customer.type,
          civility: customer.civility,
          first_name: customer.first_name,
          last_name: customer.last_name,
          company_name: customer.company_name,
          billing_line1: customer.billing_line1,
          billing_line2: customer.billing_line2,
          billing_postal_code: customer.billing_postal_code,
          billing_city: customer.billing_city,
          site_same_as_billing: customer.site_same_as_billing,
          site_line1: customer.site_line1,
          site_line2: customer.site_line2,
          site_postal_code: customer.site_postal_code,
          site_city: customer.site_city,
          email: customer.email,
          phone: customer.phone,
          siren: customer.siren,
          vat_number: customer.vat_number,
        }
      : null;
    return (
      <>
        {draft.currentVersion === 0 ? (
          <div className="mb-2 flex justify-end">
            <form action={deleteDraftAction}>
              <input type="hidden" name="id" value={draft.id} />
              <button className="link text-xs text-muted">Supprimer ce brouillon</button>
            </form>
          </div>
        ) : null}
        <QuoteEditor
          key={`${draft.id}-${draft.draftRevision}`}
          initial={draft}
          revisionEnabled={!!draft.priceRevision || (await hasFeature(ctx, "revision_prix"))}
          org={{
            trade_name: org.trade_name,
            legal_name: org.legal_name,
            address_line1: org.address_line1,
            postal_code: org.postal_code,
            city: org.city,
            siren: org.siren,
            siret: org.siret,
            vat_number: org.vat_number,
            vat_regime: org.vat_regime,
            phone: org.phone,
            email: org.email,
            insurance_decennale: org.insurance_decennale,
            insurance_name: org.insurance_name,
            insurance_policy: org.insurance_policy,
            insurance_area: org.insurance_area,
            insurance_coverage: org.insurance_coverage,
            hourly_rate: org.hourly_rate,
            travel_fee: org.travel_fee,
            trade: org.trade,
          }}
          initialCustomer={editorCustomer}
          showMargin={!!ctx.entitlements.plan.features.margin}
          assistantQuota={ctx.entitlements.plan.aiQuotaMonth}
          defaultVat={String(org.default_vat_bp / 100).replace(".", ",")}
          openAssistant={sp.assistant === "1"}
          pricing={editorPricing(readPricing(org.pricing), !!ctx.entitlements.plan.features.margin)}
        />
        {can(ctx, "costs") ? (
          <section className="card mt-6 p-4" id="sous-traitance">
            <h2 className="mb-1 text-sm font-semibold">Prix des sous-traitants</h2>
            <p className="mb-3 text-xs text-muted">
              Demandez un prix pour une partie des travaux. La réponse retenue s'ajoute au devis en ligne de sous-traitance, avec votre marge.
            </p>
            <SubQuotes
              rows={await listSubQuotes(ctx, { quoteId: id })}
              back={`/app/devis/${id}`}
              canEdit={writable}
              fixedQuoteId={id}
              subcontractors={(await listSubcontractors(ctx)).map((x) => ({ id: x.id, name: x.name, email: x.email }))}
            />
          </section>
        ) : null}
      </>
    );
  }

  /* Devis émis (ou consultation en lecture seule) */
  const row = await getQuoteRow(ctx.db, ctx, id);
  const versions = draft.currentVersion > 0 ? await listVersions(ctx, id) : [];
  const customers = (await searchCustomers(ctx, { limit: 500 })).map((c) => ({ id: c.id, name: customerDisplayName(c) }));
  const shownVersion = draft.acceptedVersion ?? draft.currentVersion;
  const current = shownVersion > 0 ? await getVersion(ctx.db, ctx.orgId, id, shownVersion) : null;
  const [events, emails, invoices] = await Promise.all([quoteEvents(ctx, id), quoteEmails(ctx, id), listInvoices(ctx, { quoteId: id })]);
  const messages = draft.currentVersion > 0 ? await listQuoteMessages(ctx, id) : [];
  const hasFinal = invoices.some((i) => i.kind === "final" && i.status !== "canceled");
  const hasDeposits = invoices.some((i) => i.kind === "deposit" && i.status !== "canceled");
  const progress = await invoicedProgress(ctx, id);
  const job = await jobForQuote(ctx, id);
  const revisionIndex = draft.priceRevision?.index;
  const revision = revisionIndex ? { index: revisionIndex, lastMonth: (await listIndexValues(ctx, revisionIndex))[0]?.month ?? "" } : null;
  const links = await ctx.db.query<{ n: unknown; viewed: Date | null }>(
    "SELECT count(*) AS n, max(first_viewed_at) AS viewed FROM share_links WHERE quote_id=$1 AND org_id=$2 AND revoked_at IS NULL AND expires_at > now()",
    [id, ctx.orgId],
  );
  const activeLinks = num(links[0]?.n);
  const amendments = await listAmendments(ctx, id);
  const acceptedAmendments = amendments.filter((a) => a.status === "accepted");
  const pending = PENDING_STATUSES.includes(draft.status);
  const status = draft.status;
  const validUntil = row.valid_until ? String(row.valid_until instanceof Date ? row.valid_until.toISOString() : row.valid_until).slice(0, 10) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/devis" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <Icon name="left" size={16} /> Devis
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{draft.number ?? "Brouillon"}</h1>
            <StatusBadge status={status} />
          </div>
          {draft.amendment ? (
            <p className="mt-1 text-sm">
              Avenant n° {draft.amendment.index} au devis{" "}
              <Link href={`/app/devis/${draft.amendment.parentId}`} className="link">
                {draft.amendment.parentNumber}
              </Link>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted">
            {draft.title || "Sans objet"}
            {customer ? (
              <>
                {" - "}
                <Link href={`/app/clients/${customer.id}`} className="hover:underline">
                  {current?.snapshot.customer.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {current ? (
          <div className="flex flex-wrap gap-2">
            <a href={`/api/quotes/${id}/pdf?version=${current.version}`} target="_blank" rel="noreferrer" className="btn-secondary">
              <Icon name="eye" size={16} /> PDF
            </a>
            <a href={`/api/quotes/${id}/pdf?version=${current.version}&download=1`} className="btn-secondary">
              <Icon name="download" size={16} /> Télécharger
            </a>
            {pending && writable ? <SendButton quoteId={id} primary={status === "ready"} /> : null}
          </div>
        ) : null}
      </div>

      {ctx.supportAccess ? <Notice tone="info">Consultation en lecture seule (accès support).</Notice> : null}
      {editable && !writable ? <Notice tone="warning">Ce brouillon est en lecture seule : {ctx.entitlements.notice}</Notice> : null}
      {status === "accepted" ? (
        <Notice tone="success" title={`Version ${draft.acceptedVersion} acceptée`}>
          Ce devis est figé. Pour des travaux supplémentaires ou modifiés, créez un avenant : il reprend le client, le chantier et les conditions.{" "}
          <a href={`/api/quotes/${id}/pdf?signe=1`} className="link" target="_blank" rel="noreferrer">
            Exemplaire accepté (PDF)
          </a>
        </Notice>
      ) : null}
      {status === "superseded" ? <Notice tone="info">Ce devis a été remplacé par un nouveau devis.</Notice> : null}
      {status === "expired" ? (
        <Notice tone="warning">La date de validité est dépassée. Vous pouvez créer une nouvelle version avec une nouvelle validité.</Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {current ? <SnapshotView s={current.snapshot} /> : <Notice tone="info">Ce brouillon n'a pas encore été émis.</Notice>}
        </div>
        <aside className="space-y-4">
          <section className="card space-y-3 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Total TTC</span>
              <span className="tabular font-semibold">{formatEuros(num(row.total_ttc_cents))}</span>
            </div>
            {validUntil ? (
              <div className="flex justify-between">
                <span className="text-muted">Valable jusqu'au</span>
                <span>{fmtDate(validUntil)}</span>
              </div>
            ) : null}
            {ctx.entitlements.plan.features.margin && current ? (
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-muted">
                  <Icon name="lock" size={12} /> Marge prévue
                </span>
                <span className="tabular">
                  {current.snapshot.calc.margin.linesWithoutCost ? "incomplète" : formatEuros(current.snapshot.calc.margin.marginCents)}
                </span>
              </div>
            ) : null}
            {row.viewed_at ? (
              <div className="flex justify-between">
                <span className="text-muted">Consulté le</span>
                <span>{fmtDate(row.viewed_at as Date, true)}</span>
              </div>
            ) : null}
          </section>

          {amendments.length || (status === "accepted" && !draft.amendment && writable) ? (
            <section className="card space-y-3 p-4 text-sm">
              <h2 className="font-semibold">Avenants</h2>
              {amendments.length ? (
                <ul className="divide-y divide-line">
                  {amendments.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <Link href={`/app/devis/${a.id}`} className="link font-medium">
                          Avenant n° {a.index}
                          {a.number ? ` (${a.number})` : ""}
                        </Link>
                        <div className="text-xs text-muted">{QUOTE_STATUSES[a.status]}</div>
                      </div>
                      <span className="tabular shrink-0">{formatEuros(a.ttcCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Aucun avenant pour l'instant.</p>
              )}
              {acceptedAmendments.length ? (
                <div className="flex justify-between border-t border-line pt-2">
                  <span className="text-muted">Total avec avenants acceptés</span>
                  <span className="tabular font-semibold">
                    {formatEuros(num(row.total_ttc_cents) + acceptedAmendments.reduce((t, a) => t + a.ttcCents, 0))}
                  </span>
                </div>
              ) : null}
              {status === "accepted" && writable ? (
                <form action={amendQuoteAction}>
                  <input type="hidden" name="id" value={id} />
                  <button className="btn-secondary w-full">
                    <Icon name="plus" size={16} /> Créer un avenant
                  </button>
                </form>
              ) : null}
            </section>
          ) : null}

          {status === "accepted" && (job || writable) ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-semibold">Chantier</h2>
              {job ? (
                <Link href={`/app/chantiers/${job.id}`} className="btn-secondary w-full">
                  <Icon name="hammer" size={16} /> Ouvrir le chantier
                </Link>
              ) : (
                <>
                  <p className="text-xs text-muted">Les lignes du devis deviennent les tâches du chantier, avec leur avancement.</p>
                  <CreateJob quoteId={id} />
                </>
              )}
            </section>
          ) : null}

          {status === "accepted" || invoices.length ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-semibold">Facturation</h2>
              {invoices.length ? (
                <ul className="divide-y divide-line text-sm">
                  {invoices.map((i) => (
                    <li key={i.id} className="py-2">
                      <Link href={`/app/factures/${i.id}`} className="flex justify-between gap-2 hover:underline">
                        <span>
                          {INVOICE_KINDS[i.kind]} {i.number}
                        </span>
                        <span className="tabular">{formatEuros(i.kind === "credit_note" ? -i.amount_due_cents : i.amount_due_cents)}</span>
                      </Link>
                      <div className="text-xs text-muted">
                        {INVOICE_STATUSES[i.status]}
                        {i.kind !== "credit_note" && i.balance_cents > 0 && i.balance_cents !== i.amount_due_cents
                          ? `, reste ${formatEuros(i.balance_cents)}`
                          : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Aucune facture pour ce devis.</p>
              )}
              {writable && status === "accepted" ? <QuoteBilling quoteId={id} defaultPercent={draft.depositPercent} hasFinal={hasFinal} hasDeposits={hasDeposits} progress={progress} revision={revision} /> : null}
            </section>
          ) : null}

          {writable && (pending || status === "expired") ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-semibold">Réponse du client</h2>
              <p className="text-xs text-muted">
                Le client peut accepter en ligne via le lien. Si sa réponse vous arrive autrement, enregistrez-la ici.
              </p>
              <ManualResponse
                quoteId={id}
                version={draft.currentVersion}
                options={current ? snapshotOptions(current.snapshot).map((o) => ({ id: o.id, label: o.label, ttcCents: o.ttcCents })) : []}
              />
            </section>
          ) : null}

          {writable && pending ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-semibold">Lien de consultation</h2>
              <p className="text-xs text-muted">
                {activeLinks ? `${activeLinks} lien(s) actif(s).` : "Aucun lien actif."} À transmettre par SMS ou messagerie si besoin.
              </p>
              <ShareLinkButton quoteId={id} />
              {activeLinks ? (
                <form action={revokeLinksAction}>
                  <input type="hidden" name="id" value={id} />
                  <button className="link text-xs">Désactiver tous les liens</button>
                </form>
              ) : null}
            </section>
          ) : null}

          {writable ? (
            <section className="card space-y-1 p-2">
              {["ready", "sent", "viewed", "refused", "expired"].includes(status) ? (
                <form action={reviseQuoteAction}>
                  <input type="hidden" name="id" value={id} />
                  <button className="btn-ghost w-full justify-start text-sm">
                    <Icon name="edit" size={16} /> Modifier (nouvelle version)
                  </button>
                </form>
              ) : null}
              <form action={duplicateQuoteAction}>
                <input type="hidden" name="id" value={id} />
                <button className="btn-ghost w-full justify-start text-sm">
                  <Icon name="copy" size={16} /> Dupliquer
                </button>
              </form>
              {customers.length > 1 ? (
                <details className="text-sm">
                  <summary className="btn-ghost w-full cursor-pointer justify-start">
                    <Icon name="users" size={16} /> Dupliquer pour un autre client
                  </summary>
                  <form action={duplicateQuoteAction} className="mt-2 space-y-2 px-1">
                    <input type="hidden" name="id" value={id} />
                    <label className="label" htmlFor="dup-customer">
                      Client
                    </label>
                    <select id="dup-customer" name="customerId" className="field" required defaultValue="">
                      <option value="" disabled>
                        Choisir un client
                      </option>
                      {customers
                        .filter((c) => c.id !== draft.customerId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <button className="btn-secondary w-full">Créer le devis</button>
                  </form>
                </details>
              ) : null}
              {["ready", "sent", "viewed", "refused", "expired"].includes(status) ? (
                <form action={duplicateQuoteAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="replace" value="1" />
                  <button className="btn-ghost w-full justify-start text-sm">
                    <Icon name="refresh" size={16} /> Remplacer par un nouveau devis
                  </button>
                </form>
              ) : null}
              {versions.length > 1 ? (
                <Link href={`/app/devis/${id}/comparer`} className="btn-ghost w-full justify-start text-sm">
                  <Icon name="compare" size={16} /> Comparer les versions
                </Link>
              ) : null}
              <form action={archiveQuoteAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="archived" value={row.archived_at ? "0" : "1"} />
                <button className="btn-ghost w-full justify-start text-sm">
                  <Icon name="archive" size={16} /> {row.archived_at ? "Désarchiver" : "Archiver"}
                </button>
              </form>
              {status !== "canceled" && status !== "superseded" ? <CancelQuote quoteId={id} accepted={status === "accepted"} /> : null}
            </section>
          ) : null}

          {versions.length ? (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Versions émises</h2>
              <ul className="space-y-3 text-sm">
                {versions.map((v) => (
                  <li key={v.version} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <a href={`/api/quotes/${id}/pdf?version=${v.version}`} target="_blank" rel="noreferrer" className="link">
                        Version {v.version}
                      </a>
                      <span className="tabular">{formatEuros(v.totalTtcCents)}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDate(v.issuedAt, true)}
                      {v.issuedBy ? ` par ${v.issuedBy}` : ""}
                      {draft.acceptedVersion === v.version ? " - acceptée" : ""}
                    </div>
                    <div className="text-xs text-muted">
                      Copie traduite :{" "}
                      {(Object.entries(LANGS) as [string, string][]).map(([code, name], i) => (
                        <span key={code}>
                          {i ? " · " : ""}
                          <a className="link" href={`/api/quotes/${id}/pdf?version=${v.version}&langue=${code}`} target="_blank" rel="noreferrer" hrefLang={code}>
                            {name}
                          </a>
                        </span>
                      ))}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted" title={`Empreinte SHA-256 du PDF : ${v.pdfSha256}`}>
                      {v.pdfSha256.slice(0, 24)}...
                    </div>
                    <IntegrityCheck quoteId={id} version={v.version} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {draft.currentVersion > 0 ? (
            <section className="card p-4" id="echanges">
              <h2 className="mb-2 text-sm font-semibold">Échanges avec le client</h2>
              <ClientThread
                quoteId={id}
                canEdit={!ctx.entitlements.readOnly && !ctx.supportAccess}
                customerEmail={current?.snapshot.customer.email ?? ""}
                messages={messages.map((m) => ({
                  id: m.id,
                  author_type: m.author_type,
                  author_name: m.author_name,
                  kind: m.kind,
                  line_label: m.line_label,
                  body: m.body,
                  handled: !!m.handled_at,
                  at: new Date(m.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }),
                }))}
              />
            </section>
          ) : null}

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Historique</h2>
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-line pl-3">
                  <div>
                    {EVENT_LABELS[e.type] ?? e.type}
                    {e.version ? <span className="text-muted"> (v{e.version})</span> : null}
                  </div>
                  <div className="text-xs text-muted">
                    {fmtDate(e.created_at, true)}
                    {e.actor_type === "client"
                      ? " - par le client"
                      : e.actor_type === "system"
                        ? " - automatique"
                        : e.actor_name
                          ? ` - ${e.actor_name}`
                          : ""}
                  </div>
                  {typeof e.data.proof === "string" ? <div className="text-xs text-muted">Preuve : {e.data.proof}</div> : null}
                  {typeof e.data.reason === "string" && e.data.reason ? <div className="text-xs text-muted">Motif : {e.data.reason}</div> : null}
                  {typeof e.data.name === "string" ? (
                    <div className="text-xs text-muted">
                      Nom saisi : {e.data.name}
                      {e.ip ? `, adresse IP ${e.ip}` : ""}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          {emails.length ? (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">E-mails</h2>
              <ul className="space-y-2 text-sm">
                {emails.map((m) => (
                  <li key={m.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.to_address}</span>
                      <span className={`text-xs ${m.status === "sent" ? "text-success" : "text-danger"}`}>
                        {m.status === "sent" ? "Envoyé" : "Échec"}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {m.kind === "reminder" ? "Relance - " : ""}
                      {fmtDate(m.created_at, true)}
                    </div>
                    {m.error ? <div className="text-xs text-danger">{m.error}</div> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Le coût interne des heures ne part dans le navigateur que si la marge est affichée. */
function editorPricing(p: Pricing, withCosts: boolean): Pricing {
  return withCosts ? p : { ...p, laborRates: p.laborRates.map((r) => ({ ...r, costCents: 0 })) };
}
