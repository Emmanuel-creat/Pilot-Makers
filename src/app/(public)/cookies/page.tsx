import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Cookies" };

const COOKIES: [string, string, string][] = [
  ["pm_session", "Maintient votre connexion. Le jeton est stocké haché côté serveur.", "30 jours au plus, supprimé à la déconnexion"],
  ["pm_2fa", "Relie la saisie du code de double authentification à la connexion en cours.", "10 minutes"],
  ["pm_support", "Trace l'accès temporaire d'un membre de l'assistance, quand vous l'avez autorisé.", "1 heure"],
];

export default function Page() {
  return (
    <LegalPage title="Cookies" updated="12 octobre 2026">
      <p>
        Pilot-Makers n'utilise que des cookies strictement nécessaires au fonctionnement du service. Aucun cookie publicitaire, de mesure
        d'audience ou de réseau social n'est déposé : aucun consentement n'est donc demandé.
      </p>
      <h2>Liste des cookies</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-semibold">Nom</th>
              <th className="py-2 pr-4 font-semibold">Rôle</th>
              <th className="py-2 font-semibold">Durée</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map(([name, role, duration]) => (
              <tr key={name} className="border-b border-line align-top">
                <td className="py-2 pr-4 font-mono text-xs">{name}</td>
                <td className="py-2 pr-4">{role}</td>
                <td className="py-2">{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Clients de vos devis</h2>
      <p>La page de consultation d'un devis par votre client ne dépose aucun cookie : le lien sécurisé suffit à l'identifier.</p>
      <h2>Évolution</h2>
      <p>Si un outil de mesure d'audience était ajouté, il serait listé ici et soumis à votre accord préalable lorsque la loi l'exige.</p>
    </LegalPage>
  );
}
