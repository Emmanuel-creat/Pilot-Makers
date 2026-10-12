import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mentions légales" };

/** Valeur fournie par l'environnement, ou mention explicite qu'elle reste à compléter. */
const v = (name: string) => process.env[name]?.trim() || "à compléter avant la mise en ligne";

export default function Page() {
  return (
    <LegalPage title="Mentions légales" updated="12 octobre 2026">
      <h2>Éditeur du service</h2>
      <ul>
        <li>Pilot-Makers, édité par BAILLY emmanuel</li>
        <li>Forme et capital : {v("LEGAL_COMPANY_FORM")}</li>
        <li>Adresse : {v("LEGAL_ADDRESS")}</li>
        <li>SIRET : {v("LEGAL_SIRET")}</li>
        <li>Contact : {v("LEGAL_EMAIL")}</li>
        <li>Directeur de la publication : BAILLY emmanuel</li>
      </ul>
      <h2>Hébergement</h2>
      <ul>
        <li>Hébergeur : {v("LEGAL_HOST_NAME")}</li>
        <li>Adresse de l'hébergeur : {v("LEGAL_HOST_ADDRESS")}</li>
        <li>Les données sont hébergées dans l'Union européenne.</li>
      </ul>
      <h2>Propriété intellectuelle</h2>
      <p>
        Le logiciel, ses textes, ses icônes et ses bibliothèques de prestations sont protégés. Les documents créés par les utilisateurs (devis,
        factures, catalogues) restent leur propriété et peuvent être exportés à tout moment.
      </p>
      <h2>Tarifs indicatifs</h2>
      <p>
        Les prix des bibliothèques de prestations sont des valeurs de départ à remplacer par les tarifs de chaque entreprise. Ils ne constituent
        ni des prix de marché, ni une recommandation tarifaire.
      </p>
      <h2>Médiation de la consommation</h2>
      <p>Le service s'adresse aux professionnels. Les litiges relèvent des conditions d'utilisation.</p>
    </LegalPage>
  );
}
