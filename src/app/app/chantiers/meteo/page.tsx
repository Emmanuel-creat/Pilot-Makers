import Link from "next/link";
import { weatherShiftAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { weatherBoard } from "@/lib/services/weather";
import { dayRisks, type DayForecast } from "@/lib/weather";

export const metadata = { title: "Météo des chantiers" };

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const n1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function DayCell({ f, warn }: { f: DayForecast; warn: boolean }) {
  const wet = f.rainMm >= 1 || f.rainProb >= 60;
  return (
    <li className={`rounded-md border p-2 text-center text-xs ${warn ? "border-warning bg-warning-soft" : "border-line"}`}>
      <div className="font-medium">{dayLabel(f.date)}</div>
      <Icon name={wet ? "rain" : f.rainProb >= 30 ? "cloud" : "sun"} size={20} className="mx-auto my-1" />
      <div className="tabular">
        {Math.round(f.tMin)} / {Math.round(f.tMax)} °C
      </div>
      <div className="tabular text-muted">
        {n1(f.rainMm)} mm, {Math.round(f.rainProb)} %
      </div>
      <div className="tabular text-muted">rafales {Math.round(f.gustKmh)} km/h</div>
    </li>
  );
}

export default async function WeatherPage() {
  const ctx = await requirePageCtx();
  const b = await weatherBoard(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const alerts = b.jobs.filter((j) => j.check?.risky).length;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Météo des chantiers"
        subtitle={
          alerts
            ? `${alerts} chantier${alerts > 1 ? "s" : ""} extérieur${alerts > 1 ? "s" : ""} planifié${alerts > 1 ? "s" : ""} sur des jours défavorables.`
            : "Prévisions à 10 jours pour vos travaux extérieurs, selon les seuils de chaque type de travaux."
        }
        back={{ href: "/app/chantiers", label: "Chantiers" }}
      />
      <div className="space-y-6">
        {!b.enabled ? (
          <p className="text-sm text-muted">Le service de prévisions est désactivé sur cette installation.</p>
        ) : b.depot ? (
          <Section title="Au dépôt">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Prévisions au dépôt">
              {b.depot.map((f) => (
                <DayCell key={f.date} f={f} warn={dayRisks(f, "general").length > 0} />
              ))}
            </ul>
          </Section>
        ) : (
          <p className="text-sm text-muted">
            Localisez l&apos;adresse de l&apos;entreprise depuis la{" "}
            <Link href="/app/carte" className="link">
              carte
            </Link>{" "}
            pour voir les prévisions au dépôt.
          </p>
        )}

        <Section title="Chantiers extérieurs" description="Indiquez sur la fiche d'un chantier qu'il se fait dehors pour le suivre ici.">
          {b.jobs.length ? (
            <ul className="divide-y divide-line" data-testid="meteo-chantiers">
              {b.jobs.map((j) => (
                <li key={j.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <Link href={`/app/chantiers/${j.id}`} className="link font-medium">
                        {j.title}
                      </Link>
                      <span className="block text-xs text-muted">
                        {j.kindLabel}
                        {j.city ? `, ${j.city}` : ""}
                        {!j.located ? ", prévision du dépôt faute de position du chantier" : ""}
                      </span>
                    </div>
                    <span className={`text-sm ${j.check?.risky ? "text-warning" : "text-muted"}`}>
                      {!j.planned
                        ? "Pas de jour planifié dans les 10 jours"
                        : !j.check
                          ? "Prévision indisponible"
                          : j.check.risky
                            ? `${j.check.risky} jour${j.check.risky > 1 ? "s" : ""} défavorable${j.check.risky > 1 ? "s" : ""} sur ${j.planned}`
                            : "Conditions favorables"}
                    </span>
                  </div>
                  {j.check?.days.some((d) => d.risks.length) ? (
                    <ul className="space-y-1 text-sm">
                      {j.check.days
                        .filter((d) => d.risks.length)
                        .map((d) => (
                          <li key={d.date} className="flex gap-2">
                            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warning" />
                            <span>
                              <span className="font-medium">{dayLabel(d.date)}</span> : {d.risks.join(", ")}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {j.check?.risky ? (
                    j.check.proposal ? (
                      canEdit ? (
                        <ActionForm action={weatherShiftAction} className="flex flex-wrap items-center gap-3">
                          <input type="hidden" name="jobId" value={j.id} />
                          <input type="hidden" name="shift" value={j.check.proposal.shift} />
                          <span className="text-sm">
                            Période favorable à partir du <span className="font-medium">{dayLabel(j.check.proposal.start)}</span>.
                          </span>
                          <Submit className="btn-secondary">
                            Décaler de {Math.abs(j.check.proposal.shift)} jour{Math.abs(j.check.proposal.shift) > 1 ? "s" : ""}
                            {j.check.proposal.shift < 0 ? " plus tôt" : ""}
                          </Submit>
                        </ActionForm>
                      ) : (
                        <p className="text-sm">Période favorable à partir du {dayLabel(j.check.proposal.start)}.</p>
                      )
                    ) : (
                      <p className="text-sm text-muted">Pas de période favorable de même durée dans les 10 jours : à revoir avec le client.</p>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="cloud" title="Aucun chantier extérieur suivi">
              Sur la fiche d&apos;un chantier, choisissez le type de travaux extérieurs pour recevoir les alertes de pluie, de vent ou de gel.
            </Empty>
          )}
        </Section>
      </div>
    </div>
  );
}
