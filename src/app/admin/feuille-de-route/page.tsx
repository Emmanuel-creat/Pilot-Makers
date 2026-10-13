import { createRoadmapAction, deleteRoadmapAction, roadmapStatusAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { listRoadmap, ROADMAP_STATUSES } from "@/lib/services/roadmap";

export const metadata = { title: "Feuille de route" };

export default async function AdminRoadmapPage() {
  const ctx = await requireAdminPage();
  const items = await listRoadmap(ctx.db);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Feuille de route" subtitle="Les sujets publiés ici apparaissent sur la page publique /feuille-de-route, où les utilisateurs votent." />
      <Section title="Publier un sujet">
        <ActionForm action={createRoadmapAction} resetOnSuccess>
          <div>
            <label className="label" htmlFor="rm-title">
              Titre
            </label>
            <input id="rm-title" name="title" className="field" required minLength={3} maxLength={140} />
          </div>
          <div>
            <label className="label" htmlFor="rm-desc">
              Description
            </label>
            <textarea id="rm-desc" name="description" rows={3} maxLength={2000} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="rm-status">
              Statut
            </label>
            <select id="rm-status" name="status" className="field" defaultValue="idee">
              {Object.entries(ROADMAP_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <Submit>Publier</Submit>
        </ActionForm>
      </Section>
      <Section title={`${items.length} sujet(s)`}>
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-muted">
                  {ROADMAP_STATUSES[it.status]}, {it.votes} vote(s)
                </div>
              </div>
              <form action={roadmapStatusAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={it.id} />
                <select name="status" defaultValue={it.status} className="field-sm" aria-label={`Statut de ${it.title}`}>
                  {Object.entries(ROADMAP_STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary text-xs">Changer</button>
              </form>
              <form action={deleteRoadmapAction}>
                <input type="hidden" name="id" value={it.id} />
                <button className="link text-xs text-danger">Supprimer</button>
              </form>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
