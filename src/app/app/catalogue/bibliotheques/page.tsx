import { Notice, PageHeader } from "@/components/ui";
import { formatUnitPrice } from "@/lib/calc/format";
import { parseScaled } from "@/lib/calc/decimal";
import { LIBRARY, LIBRARY_DATE, LIBRARY_NOTE, type LibraryTrade } from "@/lib/library";
import { requirePageCtx } from "@/lib/server/session";
import { InstallButton } from "./InstallButton";

export const metadata = { title: "Bibliothèques de prestations" };

export default async function LibrariesPage() {
  await requirePageCtx();
  return (
    <>
      <PageHeader title="Bibliothèques de prestations" back={{ href: "/app/catalogue", label: "Catalogue" }} subtitle={`Mise à jour : ${LIBRARY_DATE}`} />
      <div className="mb-6">
        <Notice tone="warning">{LIBRARY_NOTE} Les prestations ajoutées sont marquées comme indicatives jusqu'à ce que vous les modifiiez.</Notice>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.entries(LIBRARY) as [LibraryTrade, (typeof LIBRARY)[LibraryTrade]][]).map(([code, lib]) => (
          <section key={code} className="card flex flex-col p-5">
            <h2 className="font-semibold">{lib.label}</h2>
            <ul className="mt-3 flex-1 space-y-1 text-sm">
              {lib.items.map((it) => (
                <li key={it.name} className="flex justify-between gap-3">
                  <span>{it.name}</span>
                  <span className="tabular shrink-0 text-muted">
                    {formatUnitPrice(Number(parseScaled(String(it.unit_price), 4)))} / {it.unit}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <InstallButton trade={code} />
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
