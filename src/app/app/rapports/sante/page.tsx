import { healthShareCreateAction, healthShareRevokeAction } from "@/app/actions";
import { HealthReport } from "@/components/HealthReport";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { listHealthShares, myHealthScore } from "@/lib/services/health-score";

export const metadata = { title: "Score de santé" };

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

export default async function HealthPage() {
  const ctx = await requirePageCtx();
  const h = await myHealthScore(ctx);
  const shares = await listHealthShares(ctx);
  const canShare = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Score de santé"
        subtitle="Sept indicateurs des douze derniers mois, une note de A à E et les pistes pour progresser. Partagez-le avec votre banque ou votre assureur."
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <div className="space-y-6">
        <Section title="Votre score" description="Calculé à partir de vos factures, paiements, achats, frais et devis.">
          <HealthReport score={h.score} grade={h.grade} indicators={h.indicators} />
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Chiffre d&apos;affaires HT</dt>
              <dd className="tabular-nums">{formatEuros(h.figures.revenueCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Reste à encaisser TTC</dt>
              <dd className="tabular-nums">{formatEuros(h.figures.outstandingCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Carnet à facturer HT</dt>
              <dd className="tabular-nums">{formatEuros(h.figures.backlogCents)}</dd>
            </div>
          </dl>
        </Section>

        <Section
          title="Liens de partage"
          description="Un lien en lecture seule montre la note, les indicateurs et ces trois montants, sans vos clients ni vos documents. Il expire et se révoque."
        >
          {canShare ? (
            <ActionForm action={healthShareCreateAction} className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Destinataire</span>
                <input name="label" className="input" maxLength={120} placeholder="Banque, assureur" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Durée</span>
                <select name="days" className="input" defaultValue="30">
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                </select>
              </label>
              <Submit>Créer un lien</Submit>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">Seul un administrateur peut créer un lien de partage.</p>
          )}
          {shares.length ? (
            <ul className="mt-4 divide-y divide-border text-sm" data-testid="liens-score">
              {shares.map((sh) => (
                <li key={sh.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{sh.label || "Sans nom"}</span>
                    <span className="block text-muted">
                      {sh.revoked ? "Révoqué" : sh.active ? `Expire le ${date(sh.expiresAt)}` : "Expiré"}, {sh.views} consultation{sh.views > 1 ? "s" : ""}
                      {sh.lastViewedAt ? `, dernière le ${date(sh.lastViewedAt)}` : ""}
                    </span>
                  </span>
                  {sh.active && canShare ? (
                    <ActionForm action={healthShareRevokeAction}>
                      <input type="hidden" name="id" value={sh.id} />
                      <Submit className="btn-secondary">Révoquer</Submit>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
