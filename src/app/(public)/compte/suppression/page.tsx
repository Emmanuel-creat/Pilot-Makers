import { AuthCard } from "@/components/forms/AuthCard";
import { Notice } from "@/components/ui";
import { confirmDeletionAction } from "@/app/actions";
import { DELETION_DELAY_DAYS } from "@/lib/services/accounts";

export default async function Page({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  const r = jeton ? await confirmDeletionAction(jeton) : { error: "Lien incomplet" };
  return (
    <AuthCard title="Suppression du compte">
      {r?.ok ? (
        <Notice tone="success">
          Suppression confirmée. Elle deviendra définitive dans {DELETION_DELAY_DAYS} jours. D'ici là, vous pouvez l'annuler depuis la page Mon
          compte et exporter vos données.
        </Notice>
      ) : (
        <Notice tone="danger">{r?.error ?? "Lien invalide"}</Notice>
      )}
    </AuthCard>
  );
}
