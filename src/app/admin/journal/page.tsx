import { PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { auditTrail } from "@/lib/services/admin";

export const metadata = { title: "Journal" };

export default async function AuditPage() {
  const ctx = await requireAdminPage();
  const rows = await auditTrail(ctx);
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Actions d'administration, de facturation et de compte." />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Cible</th>
              <th className="px-3 py-2">Adresse IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.created_at, true)}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.target || r.org_id || ""}</td>
                <td className="px-3 py-2">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
