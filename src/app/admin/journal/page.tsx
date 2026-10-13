import { PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { auditTrail } from "@/lib/services/admin";
import { recentSealed, verifySealed } from "@/lib/services/sealed-journal";

export const metadata = { title: "Journal" };

export default async function AuditPage() {
  const ctx = await requireAdminPage();
  const rows = await auditTrail(ctx);
  const [check, sealed] = await Promise.all([verifySealed(ctx.db), recentSealed(ctx.db, 50)]);
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Actions d'administration, de facturation et de compte." />
      <section className={`card mb-6 p-4 text-sm ${check.ok ? "" : "border-danger/40 bg-danger-soft"}`} aria-labelledby="scelle">
        <h2 id="scelle" className="mb-1 font-semibold">
          Journal scellé des actions d'administration
        </h2>
        <p>
          {check.ok
            ? `Chaîne intacte : ${check.count} entrée(s) vérifiée(s).`
            : `Chaîne rompue à l'entrée ${check.brokenAt} : ${check.reason}. Ne touchez à rien et conservez une copie de la base.`}
        </p>
        <p className="mt-1 text-xs text-muted">
          Empreinte de la dernière entrée, à noter hors de la plateforme pour prouver plus tard qu'aucune entrée n'a été retirée :{" "}
          <span className="font-mono break-all">{check.lastHash}</span>
        </p>
        {sealed.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs">Dernières entrées scellées</summary>
            <ol className="mt-2 space-y-1 text-xs">
              {sealed.map((e) => (
                <li key={e.seq} className="flex flex-wrap gap-x-3">
                  <span className="tabular text-muted">n° {e.seq}</span>
                  <span>{new Date(e.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                  <span className="font-medium">{e.action}</span>
                  <span className="font-mono text-muted">{e.target || e.org || ""}</span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </section>
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
