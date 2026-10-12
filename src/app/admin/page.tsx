import { PageHeader, Section, Stat } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requireAdminPage } from "@/lib/server/session";
import { platformStats } from "@/lib/services/admin";

export const metadata = { title: "Vue d'ensemble" };

export default async function AdminHome() {
  const ctx = await requireAdminPage();
  const s = await platformStats(ctx);
  const micro = (v: number) => formatEuros(Math.round(v / 10_000));
  return (
    <>
      <PageHeader title="Vue d'ensemble" subtitle="Indicateurs du mois en cours" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Entreprises" value={s.orgs} href="/admin/comptes" />
        <Stat label="Utilisateurs actifs" value={s.users} />
        <Stat label="Devis créés (total)" value={s.quotes} />
        <Stat label="Versions émises ce mois" value={s.issuedMonth} />
        <Stat label="E-mails ce mois" value={s.emailsMonth} hint={`${s.emailsFailed} en échec`} />
        <Stat label="Appels à l'assistant" value={s.aiCalls} hint={`Coût mesuré : ${micro(s.aiCostMicroEur)}`} />
        <Stat label="Erreurs ce mois" value={s.errors} hint={`dont ${s.pdfErrors} sur les PDF`} href="/admin/erreurs" />
        <Stat label="Coût e-mails" value={micro(s.emailCostMicroEur)} />
      </div>
      <div className="mt-6">
        <Section title="Abonnements">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-2 py-2">Offre</th>
                <th className="px-2 py-2">Statut</th>
                <th className="px-2 py-2 text-right">Comptes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.subscriptions.map((x) => (
                <tr key={x.plan + x.status}>
                  <td className="px-2 py-2">{x.plan}</td>
                  <td className="px-2 py-2">{x.status}</td>
                  <td className="px-2 py-2 text-right">{x.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
