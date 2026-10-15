import { EXCHANGE_FORMAT, NATURES } from "@/lib/quote-exchange";
import { Validator } from "./Validator";

export const metadata = {
  title: "Devis ouvert : format d'échange de devis du bâtiment",
  description: "Format JSON ouvert et libre de droits pour échanger des devis entre logiciels, artisans, maîtres d'œuvre et clients.",
};

const EXAMPLE = {
  format: "devis-ouvert",
  version: "1.0",
  document: {
    number: "D-2026-0042",
    title: "Rénovation salle de bains",
    issueDate: "2026-10-15",
    validityDays: 30,
    currency: "EUR",
    seller: { name: "Carrelage Martin", siret: "73282932000074", address: { postalCode: "69003", city: "Lyon" } },
    buyer: { name: "Mme Bernard", address: { postalCode: "69006", city: "Lyon" } },
    site: { line1: "12 rue Garibaldi", postalCode: "69006", city: "Lyon", country: "France" },
    sections: [
      {
        title: "Carrelage",
        lines: [{ label: "Pose de carrelage sol", nature: "main_oeuvre", quantity: "12.5", unit: "m²", unitPrice: "45.50", vatRate: "10", optional: false }],
      },
    ],
    terms: { payment: "Acompte de 30 % à la commande", depositPercent: "30" },
    totals: { totalHt: "568.75", totalVat: "56.88", totalTtc: "625.63" },
  },
};

/** Description publique du format Devis ouvert, pour les éditeurs de logiciels et la filière. */
export default function ExchangeFormatPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-balance">
          {EXCHANGE_FORMAT.name} {EXCHANGE_FORMAT.version} : le format d&apos;échange de devis du bâtiment
        </h1>
        <p className="text-muted">
          Un devis passe d&apos;un logiciel à l&apos;autre sans ressaisie : artisan, confrère, maître d&apos;œuvre, économiste, client. Le format est un simple
          fichier JSON, libre de droits sous{" "}
          <a href={EXCHANGE_FORMAT.license.url} className="link" rel="noopener">
            {EXCHANGE_FORMAT.license.name}
          </a>
          , que tout logiciel peut lire et écrire.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Principes</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Montants HT et quantités en chaînes décimales avec un point (« 1250.50 ») : aucune erreur d&apos;arrondi d&apos;un logiciel à l&apos;autre.</li>
          <li>Taux de TVA et remises en pourcentage, ligne par ligne ; les totaux déclarés permettent de vérifier la lecture.</li>
          <li>Lots et lignes dans l&apos;ordre du devis ; une ligne peut être proposée en option, hors total.</li>
          <li>Jamais de données internes : ni coût de revient, ni marge, ni note interne.</li>
          <li>Nature de chaque ligne parmi : {NATURES.join(", ")}.</li>
          <li>
            Extension de fichier conseillée <code>{EXCHANGE_FORMAT.extension}</code>, type <code>{EXCHANGE_FORMAT.mediaType}</code>.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Schéma</h2>
        <p>
          Le schéma JSON complet est publié à l&apos;adresse{" "}
          <a href="/api/public/devis-ouvert" className="link">
            /api/public/devis-ouvert
          </a>{" "}
          (JSON Schema 2020-12). Une version 1.x reste lisible par tout lecteur de la version 1.0 : les champs ajoutés sont facultatifs.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Exemple</h2>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-4 text-xs">
          <code>{JSON.stringify(EXAMPLE, null, 2)}</code>
        </pre>
      </section>

      <section className="space-y-2" aria-labelledby="valider">
        <h2 id="valider" className="text-xl font-semibold">
          Vérifier un fichier
        </h2>
        <p>
          Éditeurs, négoces, maîtres d&apos;œuvre : vérifiez qu&apos;un fichier produit par votre logiciel est conforme. Toutes les erreurs sont listées avec le
          champ concerné, et les totaux sont recalculés. Le même contrôle est ouvert à vos programmes par un simple envoi POST du fichier à{" "}
          <code className="text-sm">/api/public/devis-ouvert/valider</code>. Rien n&apos;est conservé.
        </p>
        <Validator example={JSON.stringify(EXAMPLE, null, 2)} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Proposer une évolution</h2>
        <p>
          Le format est proposé à toute la filière : éditeurs, fédérations, organismes. Les demandes d&apos;évolution se font sur la{" "}
          <a href="/feuille-de-route" className="link">
            feuille de route publique
          </a>
          .
        </p>
      </section>
    </div>
  );
}
