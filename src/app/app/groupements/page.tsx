import { consortiumAnswerAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { CONSORTIUM_FORMS, MEMBER_STATUSES } from "@/lib/consortium";
import { requirePageCtx } from "@/lib/server/session";
import { myConsortiumInvitations } from "@/lib/services/consortia";

export const metadata = { title: "Groupements d'entreprises" };

export default async function ConsortiaPage() {
  const ctx = await requirePageCtx();
  const list = await myConsortiumInvitations(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Groupements d'entreprises"
        subtitle="Les chantiers auxquels un confrère vous propose de répondre ensemble, avec les lots qu'il vous confie."
        back={{ href: "/app/catalogue/reseaux", label: "Réseaux d'artisans" }}
      />
      <Section title="Invitations">
        {list.length ? (
          <ul className="divide-y divide-border text-sm" data-testid="groupements">
            {list.map((g) => (
              <li key={g.id} className="space-y-2 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {CONSORTIUM_FORMS[g.form]}, {MEMBER_STATUSES[g.status].toLowerCase()}
                </p>
                <p className="font-medium">{g.title || "Chantier sans titre"}</p>
                <p className="text-muted">
                  Mandataire : {g.mandataire}. Vos lots : {g.lots.length ? g.lots.join(", ") : "à attribuer par le mandataire"}.
                </p>
                {g.status === "invite" && writable ? (
                  <div className="flex gap-2">
                    <ActionForm action={consortiumAnswerAction}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <Submit className="btn-primary">Participer</Submit>
                    </ActionForm>
                    <ActionForm action={consortiumAnswerAction}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="decision" value="decline" />
                      <Submit className="btn-secondary">Décliner</Submit>
                    </ActionForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="team" title="Aucune invitation">
            Quand un confrère de vos réseaux constitue un groupement pour un chantier, son invitation arrive ici.
          </Empty>
        )}
      </Section>
    </div>
  );
}
