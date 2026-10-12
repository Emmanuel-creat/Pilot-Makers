import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { ReloadButton } from "@/components/app/Display";

export const metadata: Metadata = { title: "Hors ligne", robots: { index: false } };

/** Page affichée par l'application installée quand le téléphone n'a pas de réseau. */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Icon name="alert" size={24} />
      </div>
      <h1 className="text-xl font-semibold">Pas de connexion</h1>
      <p className="mt-2 text-muted">
        Le téléphone n'a pas accès au réseau pour le moment. Vos devis et factures sont en sécurité sur le serveur : rien n'est perdu.
      </p>
      <p className="mt-2 text-muted">Réessayez dès que le réseau revient, par exemple à la sortie du sous-sol ou du chantier.</p>
      <div className="mt-6">
        <ReloadButton />
      </div>
    </div>
  );
}
