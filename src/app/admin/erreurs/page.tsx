import Link from "next/link";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { recentErrors } from "@/lib/services/admin";

export const metadata = { title: "Erreurs" };

export default async function ErrorsPage() {
  const ctx = await requireAdminPage();
  const rows = await recentErrors(ctx);
  return (
    <>
      <PageHeader title="Erreurs techniques" subtitle="100 dernières erreurs : PDF, envoi d'e-mails, paiements, intégrité." />
      {rows.length === 0 ? (
        <Empty icon="check" title="Aucune erreur enregistrée" />
      ) : (
        <ul className="card divide-y divide-line text-sm">
          {rows.map((e) => (
            <li key={String(e.id)} className="px-4 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{e.kind}</span>
                <span className="text-xs text-muted">{fmtDate(e.created_at, true)}</span>
              </div>
              <div className="text-muted">{e.message}</div>
              {e.org_id ? (
                <Link href={`/admin/comptes/${e.org_id}`} className="link text-xs">
                  Voir le compte
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
