"use client";

import { addSkillAction, createApprenticeAction, deleteApprenticeAction, deleteSkillAction, setSkillLevelAction, updateApprenticeAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { LEVEL_LABELS, SKILL_LEVELS, type SkillLevel } from "@/lib/apprentice";

const DAYS = [
  [1, "Lundi"],
  [2, "Mardi"],
  [3, "Mercredi"],
  [4, "Jeudi"],
  [5, "Vendredi"],
  [6, "Samedi"],
] as const;

type Person = { userId: string; name: string };

export function ApprenticeForm({
  id,
  members,
  candidates,
  initial,
}: {
  id?: string;
  members: Person[];
  candidates?: Person[];
  initial?: { tutorId: string; diploma: string; school: string; contractStart: string; contractEnd: string; schoolDays: number[] };
}) {
  const v = initial ?? { tutorId: "", diploma: "", school: "", contractStart: "", contractEnd: "", schoolDays: [] };
  const p = id ? `ap-${id.slice(0, 8)}` : "ap-new";
  return (
    <ActionForm action={id ? updateApprenticeAction : createApprenticeAction} className="grid gap-3 sm:grid-cols-2">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {candidates ? (
        <div>
          <label className="label" htmlFor={`${p}-user`}>
            Apprenti
          </label>
          <select id={`${p}-user`} name="userId" className="field" required defaultValue="">
            <option value="" disabled>
              Choisir dans l&apos;équipe
            </option>
            {candidates.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor={`${p}-tutor`}>
          Tuteur
        </label>
        <select id={`${p}-tutor`} name="tutorId" className="field" defaultValue={v.tutorId}>
          <option value="">Pas encore désigné</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-diploma`}>
          Diplôme préparé
        </label>
        <input id={`${p}-diploma`} name="diploma" className="field" maxLength={120} defaultValue={v.diploma} placeholder="Ex. : CAP Carreleur mosaïste" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-school`}>
          École ou centre de formation
        </label>
        <input id={`${p}-school`} name="school" className="field" maxLength={120} defaultValue={v.school} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-start`}>
          Début du contrat
        </label>
        <input id={`${p}-start`} name="contractStart" type="date" className="field" defaultValue={v.contractStart} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-end`}>
          Fin du contrat
        </label>
        <input id={`${p}-end`} name="contractEnd" type="date" className="field" defaultValue={v.contractEnd} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Jours d&apos;école chaque semaine</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAYS.map(([d, name]) => (
            <label key={d} className="flex items-center gap-1.5">
              <input type="checkbox" name="schoolDays" value={d} defaultChecked={v.schoolDays.includes(d)} /> {name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Submit>{id ? "Enregistrer la fiche" : "Démarrer le parcours"}</Submit>
      </div>
    </ActionForm>
  );
}

export function SkillForm({ apprenticeId, skill }: { apprenticeId: string; skill: { id: string; label: string; level: SkillLevel; note: string } }) {
  const p = `sk-${skill.id.slice(0, 8)}`;
  return (
    <ActionForm action={setSkillLevelAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="skillId" value={skill.id} />
      <input type="hidden" name="apprenticeId" value={apprenticeId} />
      <div>
        <label className="sr-only" htmlFor={`${p}-level`}>
          Niveau atteint : {skill.label}
        </label>
        <select id={`${p}-level`} name="level" className="field" defaultValue={skill.level}>
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor={`${p}-note`}>
          Observation : {skill.label}
        </label>
        <input id={`${p}-note`} name="note" className="field" maxLength={300} defaultValue={skill.note} placeholder="Observation du tuteur" />
      </div>
      <Submit className="btn-secondary">Valider l&apos;étape</Submit>
    </ActionForm>
  );
}

export function AddSkillForm({ apprenticeId, categories }: { apprenticeId: string; categories: string[] }) {
  return (
    <ActionForm action={addSkillAction} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" resetOnSuccess>
      <input type="hidden" name="apprenticeId" value={apprenticeId} />
      <div>
        <label className="label" htmlFor="sk-category">
          Rubrique
        </label>
        <input id="sk-category" name="category" className="field" list="sk-categories" maxLength={80} defaultValue="Gestes du métier" />
        <datalist id="sk-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="sk-label">
          Compétence à acquérir
        </label>
        <input id="sk-label" name="label" className="field" maxLength={160} required placeholder="Ex. : Poser une faïence murale" />
      </div>
      <Submit className="btn-secondary">Ajouter au parcours</Submit>
    </ActionForm>
  );
}

export function DeleteSkill({ apprenticeId, skillId, label }: { apprenticeId: string; skillId: string; label: string }) {
  return (
    <ActionForm action={deleteSkillAction} className="inline">
      <input type="hidden" name="skillId" value={skillId} />
      <input type="hidden" name="apprenticeId" value={apprenticeId} />
      <button type="submit" className="text-xs text-muted underline" aria-label={`Retirer « ${label} » du parcours`}>
        Retirer
      </button>
    </ActionForm>
  );
}

export function DeleteApprentice({ id }: { id: string }) {
  return (
    <ActionForm action={deleteApprenticeAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Submit className="btn-secondary">Supprimer le parcours</Submit>
    </ActionForm>
  );
}
