import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { catalogSuppliers } from "@/lib/services/supplier-prices";
import { SupplierImport } from "./SupplierImport";

export const metadata = { title: "Tarifs fournisseurs" };

export default async function SupplierPricesPage() {
  const ctx = await requirePageCtx();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tarifs fournisseurs"
        back={{ href: "/app/catalogue", label: "Catalogue" }}
        subtitle="Mettez à jour vos prix d'achat depuis le fichier de prix de votre négoce. Vos prix de vente ne changent pas sans vous."
      />
      {can(ctx, "costs") ? (
        <SupplierImport suppliers={await catalogSuppliers(ctx)} />
      ) : (
        <p className="card p-5 text-sm">Les prix d'achat sont réservés aux personnes qui voient les coûts de l'entreprise.</p>
      )}
    </div>
  );
}
