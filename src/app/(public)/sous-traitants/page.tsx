import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Sous-traitants" };

const ROWS = [
  ["Hébergement de l'application et de la base de données", "À choisir (hébergeur européen recommandé)", "Union européenne"],
  ["Envoi des e-mails transactionnels", "À choisir (aucun envoi réel pour l'instant)", "À préciser"],
  ["Paiement de l'abonnement", "À choisir (Stripe ou équivalent)", "À préciser"],
  ["Assistant de préparation", "Moteur local, aucun tiers", "Serveur de l'application"],
  ["Signature électronique (V1.5)", "À choisir (prestataire qualifié)", "À préciser"],
];

export default function Page() {
  return (
    <LegalPage title="Sous-traitants techniques" updated="12 octobre 2026">
      <div className="overflow-x-auto">
        <table className="w-full border border-line text-left">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2">Finalité</th>
              <th className="px-3 py-2">Prestataire</th>
              <th className="px-3 py-2">Localisation</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r[0]} className="border-t border-line">
                {r.map((c) => (
                  <td key={c} className="px-3 py-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LegalPage>
  );
}
