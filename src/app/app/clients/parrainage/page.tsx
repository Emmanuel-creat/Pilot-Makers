import Link from "next/link";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { REFERRAL_STATES } from "@/lib/referral";
import { requirePageCtx } from "@/lib/server/session";
import { getReferralSettings, listReferrals } from "@/lib/services/referrals";
import { ReferralSettingsForm, RewardButton } from "./ReferralForms";

export const metadata = { title: "Parrainage" };

const TONE = { en_cours: "text-muted", gagne: "text-warning", perdu: "text-muted", recompense: "text-success" } as const;

export default async function ReferralsPage() {
  const ctx = await requirePageCtx();
  const [settings, r] = await Promise.all([getReferralSettings(ctx), listReferrals(ctx)]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Parrainage"
        back={{ href: "/app/clients", label: "Clients" }}
        subtitle={
          r.total
            ? `${r.total} recommandation${r.total > 1 ? "s" : ""}, ${r.won} devis signé${r.won > 1 ? "s" : ""}${r.toReward ? `, ${r.toReward} récompense${r.toReward > 1 ? "s" : ""} à remettre` : ""}.`
            : "Vos clients satisfaits recommandent l'entreprise par un lien personnel vers votre page vitrine."
        }
      />
      <div className="space-y-6">
        <Section
          title="Programme"
          description="Le lien de chaque client parrain se crée depuis sa fiche. La demande déposée par ce lien arrive dans vos demandes, marquée comme recommandation."
        >
          {canEdit ? (
            <ReferralSettingsForm {...settings} />
          ) : (
            <p className="text-sm">{settings.enabled ? `Actif : ${settings.referrerReward}.` : "Programme inactif."}</p>
          )}
        </Section>
        {r.list.length ? (
          <Section title="Recommandations">
            <ul className="divide-y divide-line text-sm" data-testid="parrainages">
              {r.list.map((x) => (
                <li key={x.leadId} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {x.name}
                      {x.city ? <span className="font-normal text-muted">{`, ${x.city}`}</span> : null}
                    </p>
                    <p className="text-xs text-muted">
                      Recommandé par{" "}
                      <Link className="link" href={`/app/clients/${x.referrerId}`}>
                        {x.referrerName}
                      </Link>{" "}
                      le {fmtDate(x.createdAt)}
                      {x.quoteId ? (
                        <>
                          {", devis "}
                          <Link className="link" href={`/app/devis/${x.quoteId}`}>
                            {x.quoteNumber ?? "en préparation"}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-medium ${TONE[x.state]}`}>{REFERRAL_STATES[x.state]}</span>
                    {canEdit && x.state === "gagne" ? <RewardButton leadId={x.leadId} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Empty icon="users" title="Aucune recommandation pour l'instant">
            Créez le lien de parrainage d&apos;un client depuis sa fiche et transmettez-le lui, par exemple à la fin du chantier.
          </Empty>
        )}
      </div>
    </div>
  );
}
