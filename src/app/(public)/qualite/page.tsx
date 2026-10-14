import { LegalPage } from "@/components/LegalPage";
import { regressionReport } from "@/lib/quality/regressions";
import mutation from "@/lib/quality/mutation.json";
import reprise from "@/lib/quality/reprise.json";

export const metadata = { title: "Rapport de qualité" };

const fr = (iso: string) => iso.split("-").reverse().join("/");

export default function Page() {
  const r = regressionReport();
  return (
    <LegalPage title="Rapport de qualité" updated={fr(r.entries[0]?.date ?? "2026-10-14")}>
      <p>
        Chaque bogue corrigé dans Pilot-Makers ajoute un test permanent, rejoué avant chaque mise en ligne : un défaut corrigé ne peut pas revenir sans être vu.
        Cette page publie la liste de ces corrections.
      </p>
      <h2>En chiffres</h2>
      <ul>
        <li>
          {r.total} correction{r.total > 1 ? "s" : ""} enregistrée{r.total > 1 ? "s" : ""}, dont {r.product} dans l&apos;application elle-même.
        </li>
        <li>
          {r.tests} test{r.tests > 1 ? "s" : ""} permanent{r.tests > 1 ? "s" : ""} les couvre{r.tests > 1 ? "nt" : ""}, vérifié{r.tests > 1 ? "s" : ""} à chaque
          modification du code.
        </li>
        <li>Les calculs de devis et de factures sont couverts à 100 % par leurs tests.</li>
        <li data-testid="score-mutation">
          Tests de mutation du {fr(mutation.date)} : sur {mutation.total} erreurs introduites volontairement dans les calculs, {mutation.killed} sont détectées par
          les tests, soit {mutation.adjusted} % des erreurs détectables
          {mutation.equivalent ? ` (${mutation.equivalent} ne changent aucun résultat et ne peuvent donc pas l'être)` : ""}.
        </li>
        <li>Les écrans principaux sont vérifiés à chaque modification sur sept téléphones parmi les plus répandus, en portrait et en paysage.</li>
        <li data-testid="exercice-reprise">
          Exercice de reprise après sinistre du {fr(reprise.date)} : {reprise.ok ? "réussi" : "à reprendre"}, base restaurée à l&apos;identique en{" "}
          {String(reprise.restoreSeconds).replace(".", ",")} secondes pour un objectif de {reprise.rtoMinutes} minutes.
        </li>
      </ul>
      <h2>Bogues corrigés</h2>
      <ul data-testid="registre-bogues">
        {r.entries.map((e) => (
          <li key={e.id}>
            <strong>
              {e.id}, {fr(e.date)}
              {e.kind === "test" ? ", contrôle automatique" : ""} :
            </strong>{" "}
            {e.title} Correction : {e.fix}
          </li>
        ))}
      </ul>
      <h2>Signaler un bogue</h2>
      <p>
        Depuis l&apos;application, le menu Aide permet d&apos;écrire au support en décrivant ce que vous faisiez. Une faille de sécurité se signale sur la page
        dédiée.
      </p>
    </LegalPage>
  );
}
