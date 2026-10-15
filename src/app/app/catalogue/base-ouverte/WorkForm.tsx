import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { WORK_TRADES } from "@/lib/open-works";
import type { OpenWork } from "@/lib/services/open-works";
import { openWorkSaveAction } from "@/app/actions";

/** Fiche à publier, à modifier (id) ou à dériver d'une autre (derivedFrom). */
export function WorkForm({ work, mode }: { work?: OpenWork; mode: "publier" | "modifier" | "deriver" }) {
  const p = mode === "publier" ? "w" : mode === "modifier" ? "e" : "d";
  return (
    <ActionForm action={openWorkSaveAction} className="space-y-3 text-sm">
      {mode === "modifier" && work ? <input type="hidden" name="id" value={work.id} /> : null}
      {mode === "deriver" && work ? <input type="hidden" name="derivedFrom" value={work.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label className="label" htmlFor={`${p}-title`}>
            Intitulé de l&apos;ouvrage
          </label>
          <input
            id={`${p}-title`}
            name="title"
            className="field"
            defaultValue={work?.title}
            placeholder="Ex. Carrelage grès cérame 60x60 collé sur chape"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-unit`}>
            Unité
          </label>
          <input id={`${p}-unit`} name="unit" className="field" defaultValue={work?.unit ?? "m²"} required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-trade`}>
            Corps d&apos;état
          </label>
          <select id={`${p}-trade`} name="trade" className="field" defaultValue={work?.trade ?? ""} required>
            <option value="">Choisir</option>
            {WORK_TRADES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-minutes`}>
            Temps de pose par unité (minutes)
          </label>
          <input id={`${p}-minutes`} name="labourMinutes" type="number" min={0} className="field tabular" defaultValue={work?.labourMinutes ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-desc`}>
          Mode opératoire
        </label>
        <textarea id={`${p}-desc`} name="description" rows={4} className="field" defaultValue={work?.description} required />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-compo`}>
          Composition par unité, une ligne par composant : quantité ; unité ; composant
        </label>
        <textarea
          id={`${p}-compo`}
          name="composition"
          rows={3}
          className="field font-mono"
          defaultValue={work?.composition.map((c) => `${c.quantity} ; ${c.unit} ; ${c.label}`).join("\n")}
          placeholder={"1,05 ; m² ; Carreau grès cérame 60x60\n5 ; kg ; Mortier-colle C2"}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-refs`}>
          Normes et références (DTU, avis techniques)
        </label>
        <input id={`${p}-refs`} name="refs" className="field" defaultValue={work?.refs} />
      </div>
      <p className="text-xs text-muted">Jamais de prix : la fiche est publiée sous Licence Ouverte 2.0, signée par votre métier et votre département.</p>
      <Submit>{mode === "modifier" ? "Enregistrer la fiche" : mode === "deriver" ? "Publier ma version" : "Publier la fiche"}</Submit>
    </ActionForm>
  );
}
