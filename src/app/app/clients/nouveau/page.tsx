import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { NewCustomer } from "./NewCustomer";

export const metadata = { title: "Nouveau client" };

export default async function NewCustomerPage() {
  await requirePageCtx();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nouveau client" back={{ href: "/app/clients", label: "Clients" }} />
      <div className="card p-5">
        <NewCustomer />
      </div>
    </div>
  );
}
