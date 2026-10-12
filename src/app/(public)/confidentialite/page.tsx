import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Politique de confidentialité" };

export default function Page() {
  return (
    <LegalPage title="Politique de confidentialité" updated="12 octobre 2026">
      <h2>Rôles</h2>
      <ul>
        <li>Pour les comptes utilisateurs et la facturation de l'abonnement, l'éditeur est responsable de traitement.</li>
        <li>
          Pour les données des clients des artisans (noms, adresses, devis), l'entreprise utilisatrice est responsable de traitement et
          l'éditeur agit comme sous-traitant, dans le cadre d'un contrat de sous-traitance.
        </li>
      </ul>
      <h2>Données traitées</h2>
      <ul>
        <li>Compte : nom, e-mail, mot de passe haché, préférences, sessions (adresse IP, navigateur).</li>
        <li>Entreprise : identité, coordonnées, assurance, informations bancaires facultatives (accès restreint).</li>
        <li>Clients de l'entreprise : identité, coordonnées, adresses de chantier, historique des documents.</li>
        <li>Preuves d'acceptation : date, version, empreinte du document, nom saisi, adresse IP, navigateur.</li>
      </ul>
      <h2>Minimisation et assistant</h2>
      <p>
        Le texte envoyé à l'assistant de préparation est limité à la description du chantier ; les adresses e-mail et numéros de téléphone y
        sont masqués. Le moteur fourni fonctionne sans transmettre de données à un tiers. Tout fournisseur de modèle de langage branché
        ultérieurement sera listé parmi les sous-traitants, avec ses conditions de réutilisation et sa localisation.
      </p>
      <h2>Durées de conservation</h2>
      <ul>
        <li>Devis émis et preuves associées : selon les obligations applicables à l'entreprise utilisatrice, paramétrables.</li>
        <li>Journaux de sécurité : 12 mois.</li>
        <li>Compte supprimé : anonymisation à l'issue du délai de rétractation de 30 jours.</li>
      </ul>
      <h2>Vos droits</h2>
      <p>
        Accès, rectification, export, effacement, limitation et opposition. L'export et la suppression sont disponibles directement dans la
        page Mon compte. Pour toute autre demande, utilisez la page Assistance.
      </p>
      <h2>Sous-traitants et transferts</h2>
      <p>
        La liste des sous-traitants techniques est publiée sur la page{" "}
        <Link className="link" href="/sous-traitants">
          Sous-traitants
        </Link>
        . L'hébergement en Union européenne est privilégié ; tout transfert hors Espace économique européen sera encadré.
      </p>
      <h2>Violation de données</h2>
      <p>En cas de violation, l'éditeur notifie l'autorité compétente et les entreprises concernées dans les délais réglementaires.</p>
    </LegalPage>
  );
}
