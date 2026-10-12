import { CsvImport } from "@/components/CsvImport";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";

export const metadata = { title: "Importer le catalogue" };

export default async function ImportCatalogPage() {
  await requirePageCtx();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Importer des prestations" back={{ href: "/app/catalogue", label: "Catalogue" }} subtitle="Rien n'est enregistré avant votre confirmation." />
      <CsvImport
        endpoint="/api/catalog-items/import"
        kind="catalog"
        backHref="/app/catalogue"
        example={"reference;name;description;category;unit;unit_cost;unit_price;vat_percent\nCAR-010;Pose de plinthes;Plinthes assorties collées;main_oeuvre;ml;4;12,5;10"}
      />
    </div>
  );
}
