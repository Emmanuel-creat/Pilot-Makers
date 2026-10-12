import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listMembers, listUserOrgs } from "@/lib/services/team";
import { changeRoleAction, inviteAction, removeMemberAction, switchOrgAction } from "@/app/actions";

export const metadata = { title: "Équipe" };

const ROLES = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" } as const;

export default async function TeamPage() {
  const ctx = await requirePageCtx();
  const [members, orgs] = await Promise.all([listMembers(ctx), listUserOrgs(ctx)]);
  const max = ctx.entitlements.plan.maxUsers;
  const canInvite = ctx.role !== "member" && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Équipe" subtitle={`${members.length} utilisateur(s) sur ${max} inclus dans l'offre ${ctx.entitlements.plan.name}`} />
      <Section title="Membres">
        <ul className="divide-y divide-line text-sm">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">
                  {m.name}
                  {m.user_id === ctx.userId ? <span className="ml-2 text-xs text-muted">(vous)</span> : null}
                </div>
                <div className="text-xs text-muted">
                  {m.email}, depuis le {fmtDate(m.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ctx.role === "owner" && m.role !== "owner" && m.user_id !== ctx.userId ? (
                  <form action={changeRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={m.user_id} />
                    <select name="role" defaultValue={m.role} className="field py-1" aria-label={`Rôle de ${m.name}`}>
                      <option value="admin">Administrateur</option>
                      <option value="member">Membre</option>
                    </select>
                    <button className="btn-secondary min-h-8 text-sm">Changer</button>
                  </form>
                ) : (
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">{ROLES[m.role]}</span>
                )}
                {canInvite && m.role !== "owner" && m.user_id !== ctx.userId ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={m.user_id} />
                    <button className="btn-ghost min-h-8 text-sm text-danger">Retirer</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Propriétaire : tous les droits, dont l'abonnement. Administrateur : profil, équipe, catalogue et devis. Membre : clients, catalogue et devis,
          sans accès aux coordonnées bancaires.
        </p>
      </Section>
      {canInvite ? (
        <Section title="Inviter une personne" description="Elle reçoit un lien valable 7 jours.">
          <ActionForm action={inviteAction} resetOnSuccess className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="label" htmlFor="inv-email">
                  Adresse e-mail
                </label>
                <input id="inv-email" name="email" type="email" className="field" required />
              </div>
              <div>
                <label className="label" htmlFor="inv-role">
                  Rôle
                </label>
                <select id="inv-role" name="role" className="field" defaultValue="member">
                  <option value="member">Membre</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
              <Submit>Inviter</Submit>
            </div>
          </ActionForm>
        </Section>
      ) : null}
      {orgs.length > 1 ? (
        <Section title="Mes entreprises" description="Vous faites partie de plusieurs entreprises.">
          <ul className="divide-y divide-line text-sm">
            {orgs.map((o) => (
              <li key={o.org_id} className="flex items-center justify-between py-2">
                <span>
                  {o.trade_name} <span className="text-muted">({ROLES[o.role]})</span>
                </span>
                {o.org_id === ctx.orgId ? (
                  <span className="text-xs text-success">active</span>
                ) : (
                  <form action={switchOrgAction}>
                    <input type="hidden" name="orgId" value={o.org_id} />
                    <button className="link">Basculer</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
