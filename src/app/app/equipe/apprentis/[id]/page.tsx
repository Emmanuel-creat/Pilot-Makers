import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { LEVEL_LABELS, contractStatus, isSchoolDay, nextSkills, progress, schoolDaysLabel } from "@/lib/apprentice";
import { requirePageCtx } from "@/lib/server/session";
import { getApprentice } from "@/lib/services/apprentices";
import { parisDate } from "@/lib/services/quotes";
import { listMembers } from "@/lib/services/team";
import { AddSkillForm, ApprenticeForm, DeleteApprentice, DeleteSkill, SkillForm } from "../ApprenticeForms";

export const metadata = { title: "Parcours d'apprentissage" };

const LEVEL_TONE = { a_voir: "text-muted", montre: "text-accent", accompagne: "text-warning", autonome: "text-success" } as const;

export default async function ApprenticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const d = await getApprentice(ctx, id).catch(() => notFound());
  const a = d.apprentice;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const canValidate = d.canValidate && writable;
  const canEdit = d.canEdit && writable;
  const members = canEdit ? await listMembers(ctx) : [];
  const today = parisDate(new Date());
  const p = progress(d.skills.map((s) => s.level));
  const c = contractStatus(a.contractEnd, today);
  const next = nextSkills(d.skills);
  const categories = [...new Set(d.skills.map((s) => s.category))];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Parcours de ${a.name}`}
        back={{ href: "/app/equipe/apprentis", label: "Apprentis" }}
        subtitle={`${a.diploma || "Diplôme non renseigné"}${a.school ? ` · ${a.school}` : ""} · tuteur : ${a.tutorName ?? "à désigner"}`}
        actions={canEdit ? <DeleteApprentice id={a.id} /> : null}
      />
      <div className="space-y-6">
        {c.tone !== "ok" ? (
          <Notice tone="warning" title={c.tone === "ended" ? "Contrat terminé" : `Fin du contrat dans ${c.daysLeft} jours`}>
            Préparez la suite avec l&apos;apprenti : poursuite d&apos;études, embauche ou fin de collaboration, et le bilan de son parcours.
          </Notice>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-sm text-muted">Avancement</p>
            <p className="text-2xl font-semibold tabular">{p.percent} %</p>
            <p className="text-sm text-muted">
              {p.autonomous} compétence{p.autonomous > 1 ? "s" : ""} acquise{p.autonomous > 1 ? "s" : ""} sur {p.total}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted">Alternance</p>
            <p className="font-medium">École : {schoolDaysLabel(a.schoolDays)}</p>
            <p className="text-sm text-muted">
              {isSchoolDay(today, a.schoolDays) ? "Aujourd'hui, l'apprenti est à l'école." : "Aujourd'hui, l'apprenti est en entreprise."}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted">Contrat</p>
            <p className="font-medium">
              {a.contractStart ? fmtDate(a.contractStart) : "Début non renseigné"} au {a.contractEnd ? fmtDate(a.contractEnd) : "fin non renseignée"}
            </p>
          </div>
        </div>
        {next.length ? (
          <Section title="À travailler en priorité" description="Les compétences les plus proches de l'autonomie, puis dans l'ordre du parcours.">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {next.map((s) => (
                <li key={s.id}>
                  {s.label} <span className="text-muted">({LEVEL_LABELS[s.level].toLowerCase()})</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {categories.map((cat) => (
          <Section key={cat} title={cat}>
            <ul className="divide-y divide-line" data-testid="parcours-apprenti">
              {d.skills
                .filter((s) => s.category === cat)
                .map((s) => (
                  <li key={s.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{s.label}</span>
                      <span className={`text-sm ${LEVEL_TONE[s.level]}`}>
                        {LEVEL_LABELS[s.level]}
                        {s.updatedAt ? ` le ${fmtDate(s.updatedAt)}${s.updatedByName ? ` par ${s.updatedByName}` : ""}` : ""}
                      </span>
                    </div>
                    {canValidate ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <SkillForm apprenticeId={a.id} skill={s} />
                        </div>
                        <DeleteSkill apprenticeId={a.id} skillId={s.id} label={s.label} />
                      </div>
                    ) : s.note ? (
                      <p className="text-sm text-muted">{s.note}</p>
                    ) : null}
                  </li>
                ))}
            </ul>
          </Section>
        ))}
        {canValidate ? (
          <Section title="Adapter le parcours" description="Ajoutez les gestes propres à votre métier et aux chantiers que l'apprenti rencontre.">
            <AddSkillForm apprenticeId={a.id} categories={categories} />
          </Section>
        ) : null}
        {canEdit ? (
          <Section title="Fiche de l'apprenti">
            <ApprenticeForm
              id={a.id}
              members={members.filter((m) => m.user_id !== a.userId).map((m) => ({ userId: m.user_id, name: m.name }))}
              initial={{
                tutorId: a.tutorId ?? "",
                diploma: a.diploma,
                school: a.school,
                contractStart: a.contractStart ?? "",
                contractEnd: a.contractEnd ?? "",
                schoolDays: a.schoolDays,
              }}
            />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
