import { LegalPage } from "@/components/LegalPage";
import { securityContact } from "@/lib/security-contact";

export const metadata = { title: "Signaler une faille de sécurité" };
export const dynamic = "force-dynamic";

export default function Page() {
  const contact = securityContact();
  return (
    <LegalPage title="Signaler une faille de sécurité" updated="12 octobre 2026">
      <p>
        Vous pensez avoir trouvé une faille dans Pilot-Makers ? Merci de nous l'indiquer avant de la rendre publique : nous protégeons ainsi les
        artisans et leurs clients pendant la correction.
      </p>
      <h2>Comment nous écrire</h2>
      <p>
        {contact ? (
          <>
            Écrivez à{" "}
            <a className="link" href={`mailto:${contact}`}>
              {contact}
            </a>{" "}
            en décrivant la faille, les étapes pour la reproduire et son effet possible.
          </>
        ) : (
          "L'adresse de signalement sera publiée ici à l'ouverture du service."
        )}
      </p>
      <h2>Nos engagements</h2>
      <ul>
        <li>Accusé de réception sous 3 jours ouvrés.</li>
        <li>Premier diagnostic et calendrier de correction sous 10 jours ouvrés.</li>
        <li>Information de la personne qui a signalé la faille à chaque étape, et remerciements publics si elle le souhaite.</li>
        <li>Aucune poursuite contre une recherche menée de bonne foi dans le cadre ci-dessous.</li>
      </ul>
      <h2>Cadre de la recherche</h2>
      <ul>
        <li>Utilisez uniquement vos propres comptes ; n'accédez pas aux données d'autres entreprises et ne les modifiez pas.</li>
        <li>Pas de déni de service, d'envoi massif d'e-mails, d'ingénierie sociale ni d'attaque physique.</li>
        <li>Arrêtez-vous dès la preuve obtenue et supprimez les données éventuellement récupérées.</li>
      </ul>
      <p>
        Le fichier{" "}
        <a className="link" href="/.well-known/security.txt">
          security.txt
        </a>{" "}
        reprend ces informations dans un format lisible par les outils de sécurité.
      </p>
    </LegalPage>
  );
}
