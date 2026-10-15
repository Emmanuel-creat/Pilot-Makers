import { deleteRuleVersionAction, publishRuleVersionAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { countryRulesOverview } from "@/lib/services/country-rules";
import { frDate, parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Règles par pays" };

/** Moteur de règles par pays : taux de TVA et mentions mis à jour à une date donnée, sans nouvelle version de l'application. */
export default async function CountryRulesPage() {
  const ctx = await requireAdminPage();
  const countries = await countryRulesOverview(ctx);
  const today = parisDate(new Date());
  return (
    <>
      <PageHeader
        title="Règles par pays"
        subtitle="Quand un taux de TVA ou une mention change, publiez une version datée : les devis l'appliquent dès cette date, sans attendre une nouvelle version de l'application."
      />
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {countries.map((c) => (
          <section key={c.code} className="card p-4" aria-labelledby={`pays-${c.code}`} data-testid={`regles-${c.code}`}>
            <h2 id={`pays-${c.code}`} className="text-lg font-semibold">
              {c.label}
            </h2>
            <p className="text-sm">
              Taux en vigueur : <span className="tabular-nums">{c.current.vatOptions.join(" %, ")} %</span>
            </p>
            <p className="text-xs text-muted">
              {c.current.version ? `Version du ${frDate(c.current.version.effectiveFrom)} : ${c.current.version.note}` : "Règles livrées avec l'application."}
            </p>
            {c.next ? (
              <p className="mt-2 text-sm">
                Prochain changement le {frDate(c.next.effectiveFrom)} : {c.next.vatOptions.join(" %, ")} %.
              </p>
            ) : null}
            {c.history.length ? (
              <ul className="mt-3 divide-y divide-line text-sm">
                {c.history.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {frDate(v.effectiveFrom)} : {v.vatOptions.join(" %, ")} %
                      {v.mentions.length ? `, ${v.mentions.length} mention${v.mentions.length > 1 ? "s" : ""}` : ""}
                    </span>
                    {v.effectiveFrom > today ? (
                      <form action={deleteRuleVersionAction}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="link text-xs text-danger">Retirer</button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted">appliquée</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      <section className="card max-w-2xl p-4" aria-labelledby="publier">
        <h2 id="publier" className="mb-3 text-lg font-semibold">
          Publier une version
        </h2>
        <ActionForm action={publishRuleVersionAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Pays</span>
              <select name="country" className="input" defaultValue="FR">
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">En vigueur à partir du</span>
              <input type="date" name="effectiveFrom" className="input" required defaultValue={today} />
            </label>
          </div>
          <label className="block">
            <span className="label">Taux de TVA, séparés par des points-virgules</span>
            <input name="vatRates" className="input" required placeholder="20 ; 10 ; 5,5 ; 2,1 ; 0" />
          </label>
          <label className="block">
            <span className="label">Mentions à rappeler, une par ligne</span>
            <textarea name="mentions" rows={3} className="input" />
          </label>
          <label className="block">
            <span className="label">Source du changement</span>
            <input name="note" className="input" required placeholder="Loi de finances, article, date de publication" />
          </label>
          <Submit>Publier la version</Submit>
        </ActionForm>
      </section>
    </>
  );
}
