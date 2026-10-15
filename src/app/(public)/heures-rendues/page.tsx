import { getDb } from "@/lib/db";
import { publicTimeSaved } from "@/lib/services/time-saved";
import { PUBLIC_MIN_ORGS, TIME_SOURCES } from "@/lib/time-saved";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Heures rendues aux artisans",
  description: "Le temps que Pilot-Makers rend chaque année aux artisans du bâtiment, mesuré tâche par tâche et publié.",
};

/** Compteur public des heures rendues, avec la méthode de calcul. */
export default async function HoursGivenBackPage() {
  const r = await publicTimeSaved(await getDb());
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-balance">Heures rendues aux artisans</h1>
        <p className="text-muted">
          Chaque devis émis, chaque relance envoyée, chaque paiement rapproché par l&apos;application est du temps rendu à l&apos;artisan. Nous le mesurons
          tâche par tâche et le publions, toutes entreprises confondues.
        </p>
      </header>
      {r.published ? (
        <section className="card space-y-4 p-6" aria-labelledby="hr-total">
          <p id="hr-total" className="text-4xl font-semibold" data-testid="heures-rendues">
            {r.hours.toLocaleString("fr-FR")} heures
          </p>
          <p className="text-muted">
            rendues depuis le 1er janvier {r.year} à {r.organizations.toLocaleString("fr-FR")} entreprises, soit {r.averageHoursPerOrg} heures en moyenne
            chacune.
          </p>
          <ul className="divide-y divide-line text-sm">
            {r.lines
              .filter((l) => l.count > 0)
              .map((l) => (
                <li key={l.key} className="flex justify-between gap-3 py-2">
                  <span>
                    {l.label} : {l.count.toLocaleString("fr-FR")}
                  </span>
                  <span className="tabular shrink-0">{l.hours.toLocaleString("fr-FR")} h</span>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <p className="card p-6 text-muted" data-testid="heures-rendues">
          Le compteur sera publié dès que {PUBLIC_MIN_ORGS} entreprises utiliseront l&apos;application.
        </p>
      )}
      <section className="space-y-2" aria-labelledby="hr-methode">
        <h2 id="hr-methode" className="text-xl font-semibold">
          Méthode
        </h2>
        <p className="text-muted">Durées prudentes de chaque tâche si elle était faite à la main :</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {TIME_SOURCES.map((s) => (
            <li key={s.key}>
              {s.label} : {s.minutes} minutes ({s.how}).
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Données ouvertes au format JSON :{" "}
          <a href="/api/public/heures-rendues" className="link">
            /api/public/heures-rendues
          </a>
          . Aucun chiffre d&apos;entreprise n&apos;est publié.
        </p>
      </section>
    </div>
  );
}
