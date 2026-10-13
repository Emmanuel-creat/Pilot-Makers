import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { listReleases } from "@/lib/services/admin";
import { releaseAction } from "@/app/actions";

export const metadata = { title: "Versions" };

export default async function ReleasesPage() {
  const ctx = await requireAdminPage();
  const rows = await listReleases(ctx.db);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Notes de version" subtitle="Affichées aux utilisateurs dans la page Nouveautés, avec le journal livré dans l'application." />
      <Section title="Publier une note">
        <ActionForm action={releaseAction} resetOnSuccess>
          <div>
            <label className="label" htmlFor="rv">
              Version
            </label>
            <input id="rv" name="version" className="field" required placeholder="1.1.0" />
          </div>
          <div>
            <label className="label" htmlFor="rn">
              Nouveautés
            </label>
            <textarea id="rn" name="notes" rows={4} className="field" />
          </div>
          <Submit>Publier</Submit>
        </ActionForm>
      </Section>
      <ul className="space-y-3 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="font-medium">
              {r.version} <span className="font-normal text-muted">{fmtDate(r.created_at)}</span>
            </div>
            <p className="whitespace-pre-line text-muted">{r.notes}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
