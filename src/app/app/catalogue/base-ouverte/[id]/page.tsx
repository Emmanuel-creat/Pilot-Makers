import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { LICENSE } from "@/lib/open-works";
import { requirePageCtx } from "@/lib/server/session";
import { getWork, workContext } from "@/lib/services/open-works";
import { openWorkImportAction, openWorkReportAction, openWorkVoteAction } from "@/app/actions";
import { WorkForm } from "../WorkForm";
import { WorkSheet } from "../WorkSheet";

export const metadata = { title: "Fiche d'ouvrage" };

export default async function OpenWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const w = await getWork(ctx.db, id).catch(() => null);
  if (!w) notFound();
  const me = await workContext(ctx, id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={w.title}
        back={{ href: "/app/catalogue/base-ouverte", label: "Base ouverte" }}
        subtitle={`${w.tradeLabel}, par ${w.unit}. ${w.author}, mise à jour le ${fmtDate(w.updatedAt)}. ${LICENSE.name}.`}
      />
      <WorkSheet work={w} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {me.importedItemId ? (
          <Link href={`/app/catalogue/${me.importedItemId}`} className="btn-secondary">
            Voir l&apos;article dans mon catalogue
          </Link>
        ) : (
          <ActionForm action={openWorkImportAction} className="inline">
            <input type="hidden" name="id" value={w.id} />
            <Submit>Reprendre dans mon catalogue</Submit>
          </ActionForm>
        )}
        {me.mine ? null : (
          <ActionForm action={openWorkVoteAction} className="inline">
            <input type="hidden" name="id" value={w.id} />
            <button className="btn-secondary" aria-pressed={me.voted}>
              {me.voted ? "Retirer mon vote" : "Fiche utile"}
            </button>
          </ActionForm>
        )}
        <span className="text-xs text-muted">
          {w.votes} vote{w.votes > 1 ? "s" : ""} utile{w.votes > 1 ? "s" : ""}, reprise par {w.imports} entreprise{w.imports > 1 ? "s" : ""}
        </span>
      </div>
      <Section title={me.mine ? "Modifier votre fiche" : "Proposer votre version"}>
        <WorkForm work={w} mode={me.mine ? "modifier" : "deriver"} />
      </Section>
      {me.mine ? null : (
        <details className="text-xs">
          <summary className="link inline-flex min-h-6 cursor-pointer items-center">Signaler la fiche</summary>
          <ActionForm action={openWorkReportAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={w.id} />
            <div>
              <label className="label" htmlFor="r-reason">
                Motif
              </label>
              <select id="r-reason" name="reason" className="field">
                <option value="erreur_technique">Erreur technique dangereuse</option>
                <option value="publicite">Publicité</option>
                <option value="copie">Contenu copié sans droit</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <Submit className="btn-secondary">Envoyer le signalement</Submit>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
