import Link from "next/link";
import { PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { searchAccounts } from "@/lib/services/admin";

export const metadata = { title: "Comptes" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const ctx = await requireAdminPage();
  const rows = await searchAccounts(ctx, q);
  return (
    <>
      <PageHeader title="Comptes" subtitle="Chaque consultation est journalisée." />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Nom d'entreprise ou e-mail" className="field" aria-label="Rechercher un compte" />
        <button className="btn-secondary">Rechercher</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-3 py-2">Entreprise</th>
              <th className="px-3 py-2">Propriétaire</th>
              <th className="px-3 py-2">Offre</th>
              <th className="px-3 py-2 text-right">Membres</th>
              <th className="px-3 py-2 text-right">Devis</th>
              <th className="px-3 py-2">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2">
                <td className="px-3 py-2">
                  <Link href={`/admin/comptes/${r.id}`} className="link font-medium">
                    {r.tradeName || "(sans nom)"}
                  </Link>
                  {r.status === "suspended" ? <span className="ml-2 text-xs text-danger">suspendu</span> : null}
                </td>
                <td className="px-3 py-2">{r.ownerEmail}</td>
                <td className="px-3 py-2">
                  {r.plan} <span className="text-xs text-muted">{r.subStatus}</span>
                </td>
                <td className="px-3 py-2 text-right">{r.members}</td>
                <td className="px-3 py-2 text-right">{r.quotes}</td>
                <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
