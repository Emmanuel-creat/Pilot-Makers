import Link from "next/link";
import { PageHeader, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { getOrganization, organizationHistory, redactForRole } from "@/lib/services/organization";
import { readSettings } from "@/lib/services/reminders";
import { OrgForm } from "./OrgForm";
import { RemindersForm } from "./RemindersForm";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";
import { IndexValues } from "./IndexValues";
import { Webhooks } from "./Webhooks";
import { ApiKeys } from "./ApiKeys";
import { listApiKeys } from "@/lib/services/api-keys";
import { API_ENDPOINTS } from "@/lib/openapi";
import { listDeliveries, listEndpoints, WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { hasFeature } from "@/lib/services/features";
import { PricingForm } from "./PricingForm";
import { listIndexValues } from "@/lib/services/revision";
import { readPricing } from "@/lib/services/pricing";
import { can } from "@/lib/services/context";
import { getShowcase, listShowcasePhotos } from "@/lib/services/showcase";
import { Showcase } from "./Showcase";
import { RgeList } from "./RgeList";
import { AccountingForm } from "./AccountingForm";
import { getPlan } from "@/lib/services/accounting-plan";
import { listRge } from "@/lib/services/aids";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Entreprise" };

const TABS = [
  ["identite", "Identité"],
  ["assurance", "Assurance"],
  ["devis", "Devis"],
  ["tarifs", "Tarifs"],
  ["apparence", "Apparence"],
  ["paiement", "Banque"],
  ["emails", "E-mails"],
  ["relances", "Relances"],
  ["vitrine", "Vitrine"],
  ["factures", "Factures"],
  ["comptabilite", "Comptabilité"],
  ["webhooks", "Webhooks"],
  ["api", "API"],
  ["historique", "Historique"],
] as const;

const FIELD_LABELS: Record<string, string> = {
  trade_name: "nom commercial",
  legal_name: "raison sociale",
  address_line1: "adresse",
  siret: "SIRET",
  siren: "SIREN",
  vat_number: "numéro de TVA",
  insurance_name: "assureur",
  insurance_policy: "contrat d'assurance",
  general_conditions: "conditions générales",
  payment_terms: "conditions de paiement",
  logo_data: "logo",
  signature_data: "signature",
  bank_iban: "IBAN",
};

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.onglet) ? sp.onglet! : "identite";
  const ctx = await requirePageCtx();
  const org = redactForRole(await getOrganization(ctx), ctx);
  const canEdit = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  const webhooksOn = await hasFeature(ctx, "webhooks");
  const apiOn = await hasFeature(ctx, "api_publique");
  const tabs = TABS.filter(
    ([k]) =>
      (k === "paiement" ? can(ctx, "settings") || can(ctx, "billing") : k === "webhooks" || k === "api" ? can(ctx, "settings") : true) && (k !== "webhooks" || webhooksOn) && (k !== "api" || apiOn),
  );
  const { created_at: _c, updated_at: _u, reminder_settings, invoice_reminder_settings, pricing, ...values } = org;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Entreprise" subtitle="Ces informations figurent sur vos devis. Une modification ne change jamais un devis déjà émis." />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections du profil">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`/app/entreprise?onglet=${k}`}
            className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab === k ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"}`}
          >
            {l}
          </Link>
        ))}
      </nav>
      {tab === "factures" ? (
        <InvoiceSettingsForm
          canEdit={canEdit}
          initial={{
            invoice_prefix: org.invoice_prefix,
            credit_prefix: org.credit_prefix,
            invoice_due_days: Number(org.invoice_due_days),
            late_penalty_text: org.late_penalty_text,
            reminders_enabled: Boolean(invoice_reminder_settings?.enabled),
            reminder_days: (invoice_reminder_settings?.days ?? [3, 15, 30]).join(", "),
            reminders_adaptive: invoice_reminder_settings?.adaptive !== false,
          }}
        />
      ) : tab === "tarifs" ? (
        <>
          <PricingForm initial={readPricing(pricing)} canEdit={canEdit} />
          <IndexValues values={await listIndexValues(ctx)} canEdit={canEdit} />
        </>
      ) : tab === "webhooks" && can(ctx, "settings") && webhooksOn ? (
        <Webhooks
          canEdit={canEdit}
          events={WEBHOOK_EVENTS}
          endpoints={(await listEndpoints(ctx)).map((e) => ({
            id: e.id,
            url: e.url,
            events: e.events,
            active: e.active,
            origin: e.api_key_id ? [e.label, `clé d'API « ${e.api_key_name ?? ""} »`].filter(Boolean).join(", ") : "",
          }))}
          deliveries={(await listDeliveries(ctx)).map((d) => ({
            id: d.id,
            event: d.event,
            url: d.url,
            attempts: d.attempts,
            delivered: !!d.delivered_at,
            failed: !!d.failed_at,
            status: d.last_status,
            error: d.last_error,
            at: new Date(d.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }),
          }))}
        />
      ) : tab === "api" && can(ctx, "settings") && apiOn ? (
        <ApiKeys
          canEdit={canEdit}
          endpoints={API_ENDPOINTS.map((e) => ({ method: e.method, path: e.path, summary: e.summary }))}
          keys={(await listApiKeys(ctx)).map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            write: k.scopes.includes("write"),
            createdBy: k.created_by_name,
            createdAt: fmtDate(k.created_at),
            lastUsed: k.last_used_at ? fmtDate(k.last_used_at) : "",
            revoked: !!k.revoked_at,
          }))}
        />
      ) : tab === "relances" ? (
        <RemindersForm initial={readSettings(reminder_settings)} allowed={!!ctx.entitlements.plan.features.reminders} canEdit={canEdit} />
      ) : tab === "vitrine" ? (
        <Showcase settings={await getShowcase(ctx)} photos={await listShowcasePhotos(ctx)} canEdit={canEdit} />
      ) : tab === "historique" ? (
        <History ctxPromise={organizationHistory(ctx)} />
      ) : tab === "comptabilite" ? (
        <AccountingForm plan={await getPlan(ctx)} canEdit={canEdit} />
      ) : tab === "assurance" ? (
        <>
          <OrgForm key={tab} tab={tab} initial={values as Record<string, string | boolean | number | null>} canEdit={canEdit} />
          <RgeList items={await listRge(ctx)} canEdit={canEdit} today={parisDate(new Date())} />
        </>
      ) : tab === "apparence" ? (
        <>
          <p className="mb-4 text-sm text-muted">
            Enregistrez vos choix puis{" "}
            <a className="text-accent underline" href="/api/organization/apercu-pdf" target="_blank" rel="noopener">
              ouvrez l&apos;aperçu de votre dernier devis
            </a>{" "}
            avec ce modèle.
          </p>
          <OrgForm key={tab} tab={tab} initial={values as Record<string, string | boolean | number | null>} canEdit={canEdit} />
        </>
      ) : (
        <OrgForm key={tab} tab={tab} initial={values as Record<string, string | boolean | number | null>} canEdit={canEdit} />
      )}
    </div>
  );
}

async function History({ ctxPromise }: { ctxPromise: ReturnType<typeof organizationHistory> }) {
  const rows = await ctxPromise;
  return (
    <div className="card divide-y divide-line">
      {rows.length === 0 ? <p className="p-5 text-sm text-muted">Aucune modification enregistrée.</p> : null}
      {rows.map((r) => (
        <div key={r.id} className="p-4 text-sm">
          <div className="text-muted">
            {fmtDate(r.created_at, true)}
            {r.user_name ? ` par ${r.user_name}` : ""}
          </div>
          <div>Modifié : {Object.keys(r.changes).map((k) => FIELD_LABELS[k] ?? k.replaceAll("_", " ")).join(", ")}</div>
        </div>
      ))}
    </div>
  );
}
