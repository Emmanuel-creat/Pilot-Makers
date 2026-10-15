import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, Notice, PageHeader, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listTemplates } from "@/lib/services/templates";
import { deleteTemplateAction, renameTemplateAction, templatePublishAction } from "@/app/actions";

export const metadata = { title: "Modèles de devis" };

export default async function TemplatesPage() {
  const ctx = await requirePageCtx();
  const templates = await listTemplates(ctx);
  const allowed = Boolean(ctx.entitlements.plan.features.templates);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Modèles de devis"
        subtitle="Vos devis types, prêts à réutiliser : sections, lignes, prix et conditions."
        actions={
          <Link href="/app/modeles/bourse" className="btn-secondary">
            <Icon name="star" size={16} /> Bourse aux modèles
          </Link>
        }
      />
      {!allowed ? (
        <Notice tone="info" title="Inclus dans les offres Professionnel et Entreprise">
          Les modèles existants restent utilisables. Pour en créer de nouveaux,{" "}
          <Link href="/app/abonnement" className="link">
            changez d'offre
          </Link>
          .
        </Notice>
      ) : null}
      {templates.length === 0 ? (
        <Empty icon="copy" title="Aucun modèle pour l'instant">
          Ouvrez un devis bien construit et choisissez « Modèle » dans la barre du haut. Il apparaîtra ici et dans la création de devis.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">{t.name}</div>
                  {t.description ? <p className="text-sm text-muted">{t.description}</p> : null}
                  <div className="mt-1 text-xs text-muted">
                    {t.line_count} ligne{t.line_count > 1 ? "s" : ""}, utilisé {t.usage_count} fois, modifié le {fmtDate(t.updated_at)}
                  </div>
                </div>
                <Link href={`/app/devis/nouveau?modele=${t.id}`} className="btn-primary shrink-0">
                  <Icon name="plus" size={16} /> Nouveau devis
                </Link>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted">Renommer, publier ou supprimer</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <ActionForm action={renameTemplateAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="id" value={t.id} />
                    <div>
                      <label className="label" htmlFor={`n-${t.id}`}>
                        Nom
                      </label>
                      <input id={`n-${t.id}`} name="name" className="field" defaultValue={t.name} required maxLength={120} />
                    </div>
                    <div>
                      <label className="label" htmlFor={`d-${t.id}`}>
                        Description
                      </label>
                      <input id={`d-${t.id}`} name="description" className="field" defaultValue={t.description} maxLength={500} />
                    </div>
                    <Submit className="btn-secondary">Enregistrer</Submit>
                  </ActionForm>
                  {ctx.role !== "member" ? (
                    <ActionForm action={templatePublishAction} className="grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
                      <input type="hidden" name="templateId" value={t.id} />
                      <div>
                        <label className="label" htmlFor={`bt-${t.id}`}>
                          Titre dans la bourse
                        </label>
                        <input id={`bt-${t.id}`} name="title" className="field" defaultValue={t.name} required maxLength={120} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`bs-${t.id}`}>
                          Présentation
                        </label>
                        <input id={`bs-${t.id}`} name="summary" className="field" defaultValue={t.description} maxLength={1000} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`bp-${t.id}`}>
                          Prix (vide : gratuit)
                        </label>
                        <input id={`bp-${t.id}`} name="price" className="field" inputMode="decimal" placeholder="0" />
                      </div>
                      <Submit className="btn-secondary">Publier dans la bourse</Submit>
                    </ActionForm>
                  ) : null}
                  {ctx.role !== "member" ? (
                    <form action={deleteTemplateAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn-ghost text-danger">
                        <Icon name="trash" size={16} /> Supprimer
                      </button>
                    </form>
                  ) : null}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
