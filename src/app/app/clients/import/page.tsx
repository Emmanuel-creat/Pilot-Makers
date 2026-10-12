import { CsvImport } from "@/components/CsvImport";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";

export const metadata = { title: "Importer des clients" };

export default async function ImportCustomersPage() {
  await requirePageCtx();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Importer des clients" back={{ href: "/app/clients", label: "Clients" }} subtitle="Rien n'est enregistré avant votre confirmation." />
      <CsvImport
        endpoint="/api/customers/import"
        kind="customers"
        backHref="/app/clients"
        example={"type;nom;prenom;societe;adresse;code postal;ville;email;telephone\nparticulier;Durand;Paul;;3 rue des Lilas;69003;Lyon;paul.durand@exemple.fr;0601020304"}
      />
    </div>
  );
}
