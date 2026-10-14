import Link from "next/link";
import { adviceDismissAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { proactiveAdvice } from "@/lib/services/advice";

export const metadata = { title: "Conseils" };

const PRIORITY = {
  1: { label: "Urgent", tone: "text-accent" },
  2: { label: "Important", tone: "text-warning" },
  3: { label: "À prévoir", tone: "text-muted" },
};

export default async function AdvicePage() {
  const ctx = await requirePageCtx();
  const list = await proactiveAdvice(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Conseils"
        subtitle="Les actions les plus utiles du moment, tirées de vos devis, factures, chantiers et planning. Les plus rentables d'abord."
        back={{ href: "/app", label: "Tableau de bord" }}
      />
      {list.length ? (
        <ol className="space-y-3" data-testid="conseils">
          {list.map((a) => (
            <li key={a.key} className="card flex flex-wrap items-start gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium uppercase tracking-wide ${PRIORITY[a.priority].tone}`}>{PRIORITY[a.priority].label}</p>
                <h2 className="mt-1 font-semibold">{a.title}</h2>
                <p className="mt-1 text-muted">{a.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={a.href} className="btn-primary">
                  Agir <Icon name="right" size={16} />
                </Link>
                {writable ? (
                  <ActionForm action={adviceDismissAction}>
                    <input type="hidden" name="key" value={a.key} />
                    <Submit className="btn-secondary">Masquer 30 jours</Submit>
                  </ActionForm>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon="check" title="Rien d'urgent pour l'instant">
          Les conseils apparaissent dès qu&apos;une facture, un devis ou un chantier demande votre attention.
        </Empty>
      )}
    </div>
  );
}
