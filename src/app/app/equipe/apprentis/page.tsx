import Link from "next/link";
import { Notice, PageHeader, Section } from "@/components/ui";
import { contractStatus, progress, schoolDaysLabel } from "@/lib/apprentice";
import { requirePageCtx } from "@/lib/server/session";
import { listApprentices } from "@/lib/services/apprentices";
import { can } from "@/lib/services/context";
import { parisDate } from "@/lib/services/quotes";
import { listMembers } from "@/lib/services/team";
import { ApprenticeForm } from "./ApprenticeForms";

export const metadata = { title: "Apprentis" };

export default async function ApprenticesPage() {
  const ctx = await requirePageCtx();
  const staff = can(ctx, "staff");
  const [apprentices, members] = await Promise.all([listApprentices(ctx), staff ? listMembers(ctx) : Promise.resolve([])]);
  const today = parisDate(new Date());
  const taken = new Set(apprentices.map((a) => a.userId));
  const people = members.map((m) => ({ userId: m.user_id, name: m.name }));
  const candidates = members.filter((m) => m.role !== "owner" && !taken.has(m.user_id)).map((m) => ({ userId: m.user_id, name: m.name }));
  const canEdit = staff && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Parcours des apprentis"
        back={{ href: "/app/equipe", label: "Équipe" }}
        subtitle="Les compétences à acquérir au fil de l'alternance, validées étape par étape par le tuteur."
      />
      <div className="space-y-6">
        <Section title="Apprentis suivis">
          {apprentices.length === 0 ? (
            <p className="text-sm text-muted">Aucun parcours en cours.</p>
          ) : (
            <ul className="divide-y divide-line">
              {apprentices.map((a) => {
                const p = progress(a.levels);
                const c = contractStatus(a.contractEnd, today);
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/app/equipe/apprentis/${a.id}`} className="font-medium underline">
                        {a.name}
                      </Link>
                      <p className="text-sm text-muted">
                        {a.diploma || "Diplôme non renseigné"} · tuteur : {a.tutorName ?? "à désigner"} · école : {schoolDaysLabel(a.schoolDays)}
                      </p>
                      {c.tone !== "ok" ? (
                        <p className="text-sm text-warning">{c.tone === "ended" ? "Contrat terminé" : `Fin du contrat dans ${c.daysLeft} jours`}</p>
                      ) : null}
                    </div>
                    <div className="w-40 text-right text-sm">
                      <div className="tabular">
                        {p.autonomous}/{p.total} acquises · {p.percent} %
                      </div>
                      <div className="mt-1 h-2 rounded bg-surface-2" aria-hidden="true">
                        <div className="h-2 rounded bg-accent" style={{ width: `${p.percent}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        {canEdit ? (
          <Section
            title="Démarrer un parcours"
            description="Le parcours proposé couvre la sécurité, l'organisation du chantier, les gestes du métier et la relation client. Vous l'adaptez ensuite."
          >
            {candidates.length ? (
              <ApprenticeForm members={people} candidates={candidates} />
            ) : (
              <Notice tone="info">Invitez d&apos;abord l&apos;apprenti dans votre équipe pour lui ouvrir un parcours.</Notice>
            )}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
