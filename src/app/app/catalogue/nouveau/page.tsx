import { ItemForm } from "@/components/ItemForm";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";

export const metadata = { title: "Nouvelle prestation" };

export default async function NewItemPage() {
  const ctx = await requirePageCtx();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nouvelle prestation" back={{ href: "/app/catalogue", label: "Catalogue" }} />
      <div className="card p-5">
        <ItemForm showCosts={ctx.role !== "member" || !!ctx.entitlements.plan.features.margin} />
      </div>
    </div>
  );
}
