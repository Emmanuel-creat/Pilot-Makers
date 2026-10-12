import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { CATEGORIES, searchItems } from "@/lib/services/catalog";
import { CatalogTable } from "./CatalogTable";

export const metadata = { title: "Catalogue" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; fav?: string; archives?: string; tri?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const rows = await searchItems(ctx, {
    q: sp.q,
    category: sp.cat || undefined,
    favorites: sp.fav === "1",
    includeArchived: sp.archives === "1",
    sort: (sp.tri as "name" | "usage" | "recent") || "name",
    limit: 2000,
  });
  const showCosts = ctx.role !== "member" || !!ctx.entitlements.plan.features.margin;
  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle={`${rows.length} prestation${rows.length > 1 ? "s" : ""}`}
        actions={
          <>
            <Link href="/app/catalogue/bibliotheques" className="btn-secondary">
              <Icon name="box" size={16} /> Bibliothèques
            </Link>
            <a href="/api/catalog-items/export" className="btn-secondary">
              <Icon name="download" size={16} /> Exporter
            </a>
            <Link href="/app/catalogue/import" className="btn-secondary">
              <Icon name="upload" size={16} /> Importer
            </Link>
            <Link href="/app/catalogue/nouveau" className="btn-primary">
              <Icon name="plus" size={16} /> Nouvelle prestation
            </Link>
          </>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_160px_auto_auto]">
        <div className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Nom, référence, fournisseur" className="field pl-9" aria-label="Rechercher" />
        </div>
        <select name="cat" defaultValue={sp.cat ?? ""} className="field" aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="tri" defaultValue={sp.tri ?? "name"} className="field" aria-label="Tri">
          <option value="name">Par catégorie</option>
          <option value="usage">Les plus utilisées</option>
          <option value="recent">Modifiées récemment</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="fav" value="1" defaultChecked={sp.fav === "1"} className="h-4 w-4" /> Favoris
        </label>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {rows.length === 0 ? (
        <Empty
          icon="box"
          title={sp.q || sp.cat ? "Aucune prestation trouvée" : "Votre catalogue est vide"}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/app/catalogue/bibliotheques" className="btn-primary">
                Partir d'une bibliothèque
              </Link>
              <Link href="/app/catalogue/nouveau" className="btn-secondary">
                Créer une prestation
              </Link>
            </div>
          }
        >
          Enregistrez vos prestations avec vos propres prix pour composer vos devis en quelques clics.
        </Empty>
      ) : (
        <CatalogTable
          showCosts={showCosts}
          categories={{ ...CATEGORIES }}
          rows={rows.map((r) => ({
            id: r.id,
            reference: r.reference,
            name: r.name,
            category: r.category,
            subcategory: r.subcategory,
            unit: r.unit,
            unit_price4: r.unit_price4,
            unit_cost4: showCosts ? r.unit_cost4 : null,
            vat_bp: r.vat_bp,
            favorite: r.favorite,
            active: r.active,
            usage_count: r.usage_count,
            source: r.source,
            kind: r.kind,
          }))}
        />
      )}
      <p className="mt-4 text-sm">
        <Link href={sp.archives === "1" ? "/app/catalogue" : "/app/catalogue?archives=1"} className="link">
          {sp.archives === "1" ? "Masquer les prestations inactives" : "Afficher aussi les prestations inactives"}
        </Link>
      </p>
    </>
  );
}
