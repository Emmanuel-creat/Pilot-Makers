import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Conditions d'utilisation" };

export default function Page() {
  return (
    <LegalPage title="Conditions générales d'utilisation" updated="12 octobre 2026">
      <h2>1. Objet</h2>
      <p>
        Pilot-Makers est un logiciel en ligne d'aide à la création, à l'envoi et au suivi de devis, destiné aux professionnels du bâtiment.
        Les présentes conditions encadrent son utilisation.
      </p>
      <h2>2. Compte et sécurité</h2>
      <ul>
        <li>Chaque compte appartient à un espace entreprise. L'utilisateur garde ses identifiants confidentiels.</li>
        <li>Le titulaire de l'espace gère les utilisateurs invités et leurs rôles, dans les limites de son offre.</li>
      </ul>
      <h2>3. Responsabilité de l'utilisateur sur ses documents</h2>
      <p>
        L'utilisateur reste seul responsable du contenu de ses devis : quantités, prix, taux de TVA, mentions et conformité à la
        réglementation applicable à son métier. Les contrôles proposés par le logiciel sont une aide et ne constituent pas un conseil
        juridique ou fiscal.
      </p>
      <h2>4. Assistant de préparation</h2>
      <p>
        Les propositions de l'assistant sont indicatives. Les quantités estimées et les tarifs issus de bibliothèques sont signalés comme tels
        et doivent être vérifiés. Aucun devis n'est émis sans confirmation explicite de l'utilisateur.
      </p>
      <h2>5. Abonnement</h2>
      <ul>
        <li>Les offres, leurs limites et leurs prix sont indiqués sur la page Tarifs. L'abonnement est renouvelé automatiquement.</li>
        <li>En cas d'échec de paiement, une période de grâce est accordée. Ensuite, l'offre Découverte s'applique.</li>
        <li>Les documents ne sont jamais supprimés du fait d'un arrêt de paiement : ils restent consultables et exportables.</li>
      </ul>
      <h2>6. Données et réversibilité</h2>
      <p>
        L'utilisateur peut exporter ses données à tout moment depuis la page Mon compte. La suppression du compte suit une procédure
        confirmée par e-mail, avec un délai de rétractation de 30 jours.
      </p>
      <h2>7. Disponibilité</h2>
      <p>L'éditeur vise une disponibilité mensuelle de 99,5 %, hors maintenance annoncée et cas de force majeure. Il ne s'agit pas d'une garantie.</p>
      <h2>8. Suspension</h2>
      <p>
        Un compte peut être suspendu en cas d'usage abusif, selon une procédure documentée. La suspension ne supprime pas les données, qui
        restent exportables.
      </p>
      <h2>9. Éditeur</h2>
      <p>Pilot-Makers est édité par BAILLY emmanuel. Coordonnées complètes à compléter avant la mise en service.</p>
    </LegalPage>
  );
}
