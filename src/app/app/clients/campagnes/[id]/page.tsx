import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { MAX_RECIPIENTS } from "@/lib/campaigns";
import { requirePageCtx } from "@/lib/server/session";
import { previewCampaign } from "@/lib/services/campaigns";
import { can } from "@/lib/services/context";
import { CampaignForm, DeleteCampaign, SendCampaign } from "../CampaignForms";

export const metadata = { title: "Campagne" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const p = await previewCampaign(ctx, id).catch(() => notFound());
  const c = p.campaign;
  const draft = c.status === "brouillon" && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={c.name}
        back={{ href: "/app/clients/campagnes", label: "Campagnes" }}
        subtitle={c.status === "envoyee" ? `Envoyée le ${fmtDate(c.sentAt, true)} à ${c.recipients} client${c.recipients > 1 ? "s" : ""}` : "Brouillon"}
        actions={draft ? <DeleteCampaign id={c.id} /> : null}
      />
      <div className="space-y-6">
        {c.status === "brouillon" ? (
          <Section
            title={`${p.recipients.length} destinataire${p.recipients.length > 1 ? "s" : ""}`}
            description="Clients joignables par e-mail, non désinscrits, qui répondent aux critères."
          >
            {p.tooMany ? <Notice tone="warning">Plus de {MAX_RECIPIENTS} clients correspondent : affinez les critères avant l&apos;envoi.</Notice> : null}
            {p.recipients.length ? (
              <ul className="mb-4 max-h-60 divide-y divide-line overflow-y-auto text-sm" data-testid="destinataires">
                {p.recipients.map((r) => (
                  <li key={r.customerId} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>{r.name}</span>
                    <span className="text-muted">{r.lastInvoiceDate ? `dernière facture le ${fmtDate(r.lastInvoiceDate)}` : "jamais facturé"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">Aucun client ne correspond aux critères.</p>
            )}
            {draft && p.recipients.length && !p.tooMany ? <SendCampaign id={c.id} count={p.recipients.length} /> : null}
          </Section>
        ) : null}
        {p.sample ? (
          <Section title="Aperçu du message" description={`Tel que le recevra ${p.recipients[0].name}.`}>
            <p className="mb-2 text-sm font-medium">{p.sample.subject}</p>
            <pre className="whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-sans text-sm">{p.sample.body}</pre>
          </Section>
        ) : null}
        {draft ? (
          <Section title="Modifier la campagne">
            <CampaignForm id={c.id} initial={{ name: c.name, subject: c.subject, body: c.body, filters: c.filters }} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
