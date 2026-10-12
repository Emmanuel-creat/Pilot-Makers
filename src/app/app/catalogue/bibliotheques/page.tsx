import { Notice, PageHeader } from "@/components/ui";
import { formatUnitPrice } from "@/lib/calc/format";
import { parseScaled } from "@/lib/calc/decimal";
import { LIBRARY, LIBRARY_DATE, LIBRARY_NOTE, tradeForProfession, type LibraryTrade } from "@/lib/library";
import { getOrganization } from "@/lib/services/organization";
import { requirePageCtx } from "@/lib/server/session";
import { InstallButton } from "./InstallButton";

export const metadata = { title: "Bibliothèques de prestations" };

export default async function LibrariesPage() {
  const ctx = await requirePageCtx();
  const mine = tradeForProfession((await getOrganization(ctx)).trade ?? "");
  const order = (code: LibraryTrade) => (code === mine ? 0 : code === "commun" ? 1 : 2);
  const libs = (Object.entries(LIBRARY) as [LibraryTrade, (typeof LIBRARY)[LibraryTrade]][]).sort((a, b) => order(a[0]) - order(b[0]));
  return (
    <>
      <PageHeader title="Bibliothèques de prestations" back={{ href: "/app/catalogue", label: "Catalogue" }} subtitle={`Mise à jour : ${LIBRARY_DATE}`} />
      <div className="mb-6">
        <Notice tone="warning">{LIBRARY_NOTE} Les prestations ajoutées sont marquées comme indicatives jusqu'à ce que vous les modifiiez.</Notice>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {libs.map(([code, lib]) => (
          <section key={code} className="card flex flex-col p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{lib.label}</h2>
              {code === mine ? <span className="text-xs font-medium text-accent">Votre métier</span> : null}
            </div>
            <p className="mt-1 text-xs text-muted">{lib.items.length} prestations</p>
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
