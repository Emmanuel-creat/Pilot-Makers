import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { CAMPAIGN_TEMPLATES, readFilters, type CampaignTemplate } from "@/lib/campaigns";
import { requirePageCtx } from "@/lib/server/session";
import { listCampaigns } from "@/lib/services/campaigns";
import { can } from "@/lib/services/context";
import { CampaignForm } from "./CampaignForms";

export const metadata = { title: "Campagnes" };

const PRESET: Record<CampaignTemplate, Record<string, string>> = {
  entretien: { monthsMin: "11", monthsMax: "13" },
  saison: { monthsMin: "6" },
  libre: {},
};

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ modele?: string }> }) {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const sp = await searchParams;
  const model = (sp.modele && sp.modele in CAMPAIGN_TEMPLATES ? sp.modele : "entretien") as CampaignTemplate;
  const t = CAMPAIGN_TEMPLATES[model];
  const campaigns = await listCampaigns(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Campagnes vers les anciens clients"
        back={{ href: "/app/clients", label: "Clients" }}
        subtitle="Rappelez l'entretien annuel ou les travaux de saison aux clients que vous avez déjà servis."
      />
      <div className="space-y-6">
        <Section title="Campagnes">
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted">Aucune campagne pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {campaigns.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/app/clients/campagnes/${c.id}`} className="link font-medium">
                    {c.name}
                  </Link>
                  <span className="text-muted">
                    {c.status === "envoyee" ? `Envoyée le ${fmtDate(c.sentAt)} à ${c.recipients} client${c.recipients > 1 ? "s" : ""}` : "Brouillon"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {writable ? (
          <Section
            title="Nouvelle campagne"
            actions={
              <nav className="flex flex-wrap gap-1 text-sm" aria-label="Modèles de message">
                {Object.entries(CAMPAIGN_TEMPLATES).map(([k, v]) => (
                  <Link
                    key={k}
                    href={`/app/clients/campagnes?modele=${k}`}
                    className={k === model ? "btn-primary" : "btn-ghost"}
                    aria-current={k === model ? "page" : undefined}
                  >
                    {v.label}
                  </Link>
                ))}
              </nav>
            }
          >
            <CampaignForm key={model} initial={{ name: t.label, subject: t.subject, body: t.body, filters: readFilters(PRESET[model]) }} />
          </Section>
        ) : null}
        <Notice tone="info">
          Seuls les clients avec une adresse e-mail et qui ne se sont pas désinscrits reçoivent vos campagnes. L&apos;envoi par SMS sera proposé une fois un
          prestataire SMS raccordé.
        </Notice>
      </div>
    </div>
  );
}
