import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listMembers, listUserOrgs } from "@/lib/services/team";
import { changeRoleAction, inviteAction, removeMemberAction, switchOrgAction } from "@/app/actions";
import { getOrganization } from "@/lib/services/organization";
import { readPricing } from "@/lib/services/pricing";
import { QualificationForm } from "./QualificationForm";
import { can, JOB_FUNCTIONS } from "@/lib/services/context";
import { FunctionForm } from "./FunctionForm";
import { CertificationForm, DeleteCertification } from "./CertificationForm";
import { listCertifications } from "@/lib/services/certifications";
import { CERT_STATUSES, type CertStatus } from "@/lib/certifications";

const CERT_TONE: Record<CertStatus, string> = { valide: "text-success", a_renouveler: "text-warning", expiree: "text-danger", permanente: "text-muted" };

export const metadata = { title: "Équipe" };

const ROLES = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" } as const;

const FUNCTION_OPTIONS = Object.entries(JOB_FUNCTIONS).map(([k, v]) => [k, v.label] as [string, string]);

export default async function TeamPage() {
  const ctx = await requirePageCtx();
  const [members, orgs, org, certs] = await Promise.all([listMembers(ctx), listUserOrgs(ctx), getOrganization(ctx), listCertifications(ctx)]);
  const canWrite = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const manageTeam = can(ctx, "staff");
  const qualifications = readPricing(org.pricing).laborRates.map((r) => r.label);
  const max = ctx.entitlements.plan.maxUsers;
  const canInvite = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
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
                {canInvite && m.user_id !== ctx.userId ? (
                  <FunctionForm userId={m.user_id} name={m.name} value={m.job_function ?? ""} options={FUNCTION_OPTIONS} ownerOnlyGerant={m.role === "owner"} />
                ) : m.job_function ? (
                  <div className="text-xs text-muted">{JOB_FUNCTIONS[m.job_function].label}</div>
                ) : null}
                {canInvite && qualifications.length ? (
                  <QualificationForm userId={m.user_id} name={m.name} value={m.qualification} options={qualifications} />
                ) : m.qualification ? (
                  <div className="text-xs text-muted">{m.qualification}</div>
                ) : null}
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
        <dl className="mt-3 space-y-1 text-xs text-muted">
          {Object.values(JOB_FUNCTIONS).map((f) => (
            <div key={f.label}>
              <dt className="inline font-medium text-ink">{f.label} : </dt>
              <dd className="inline">{f.description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">
          Sans fonction précisée, le rôle s'applique : le propriétaire a tous les droits, dont l'abonnement ; un administrateur gère le profil, l'équipe et les
          chantiers ; un membre prépare clients, catalogue et devis. La qualification (taux de l'onglet Tarifs) sert au coût des heures pointées.
        </p>
      </Section>
      <Section
        title="Habilitations et formations"
        description="Habilitation électrique, SST, travail en hauteur, CACES : les échéances sont suivies, avec un rappel un mois avant."
      >
        {certs.length ? (
          <ul className="mb-4 divide-y divide-line text-sm" aria-label="Habilitations de l'équipe">
            {certs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{c.userName}</span> : {c.name}
                    {c.note ? <span className="text-muted"> ({c.note})</span> : null}
                  </div>
                  <div className={`text-xs ${CERT_TONE[c.status]}`}>
                    {CERT_STATUSES[c.status]}
                    {c.validUntil ? `, ${c.status === "expiree" ? "depuis le" : "jusqu'au"} ${fmtDate(c.validUntil)}` : ""}
                  </div>
                </div>
                {canWrite && (manageTeam || c.userId === ctx.userId) ? <DeleteCertification id={c.id} label={`${c.name} de ${c.userName}`} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">Aucune habilitation renseignée.</p>
        )}
        {canWrite ? <CertificationForm people={members.map((m) => ({ id: m.user_id, name: m.name }))} defaultUser={ctx.userId} canChoose={manageTeam} /> : null}
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
                <label className="label" htmlFor="inv-function">
                  Fonction
                </label>
                <select id="inv-function" name="jobFunction" className="field" defaultValue="ouvrier">
                  {FUNCTION_OPTIONS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
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
