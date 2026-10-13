"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { assignAction, deleteAssignmentAction, moveAssignmentAction, vehicleAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { addDays, daysBetween, isWeekend } from "@/lib/services/planning-dates";

type Resource = { type: "user" | "vehicle"; id: string; name: string; detail: string };
type Slot = {
  id: string;
  jobId: string;
  resourceType: "user" | "vehicle";
  resourceId: string;
  start: string;
  end: string;
  title: string;
  city: string;
  conflict: boolean;
};

const dayLabel = (iso: string, compact: boolean) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return compact
    ? d.toLocaleDateString("fr-FR", { day: "numeric", timeZone: "UTC" })
    : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/** Grille du planning : une ligne par personne ou véhicule, une colonne par jour. Les affectations se glissent d'une case à l'autre. */
export function PlanningGrid({ resources, days, slots, canEdit }: { resources: Resource[]; days: string[]; slots: Slot[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const compact = days.length > 7;
  const move = (id: string, resource: string, startDay: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("resource", resource);
      fd.set("start", startDay);
      const r = await moveAssignmentAction(null, fd);
      setMessage(r);
      router.refresh();
    });
  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {pending ? "Déplacement en cours" : (message?.message ?? message?.error ?? "")}
      </p>
      {message?.error || message?.message ? (
        <p className={`mb-2 text-sm ${message.error ? "text-danger" : message.message?.includes("conflit") ? "text-warning" : "text-success"}`}>
          {message.error ?? message.message}
        </p>
      ) : null}
      <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label="Grille du planning">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="table-head sticky left-0 z-10 min-w-36 px-3 py-2">
                Équipe et véhicules
              </th>
              {days.map((d) => (
                <th
                  scope="col"
                  key={d}
                  className={`table-head px-1 py-2 text-center ${compact ? "min-w-10" : "min-w-28"} ${isWeekend(d) ? "italic" : ""}`}
                >
                  {dayLabel(d, compact)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => {
              const key = `${r.type}:${r.id}`;
              const mine = slots.filter((s) => s.resourceType === r.type && s.resourceId === r.id);
              return (
                <tr key={key} className="border-b border-line last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">
                    <div className="flex items-center gap-2">
                      <Icon name={r.type === "user" ? "user" : "truck"} size={16} className="text-muted" />
                      <span className="truncate font-medium">{r.name}</span>
                    </div>
                    <div className="text-xs text-muted">{r.detail}</div>
                  </th>
                  {days.map((d) => {
                    const cell = `${key}@${d}`;
                    const here = mine.filter((s) => s.start <= d && s.end >= d);
                    return (
                      <td
                        key={d}
                        className={`h-14 border-l border-line p-0.5 align-top ${isWeekend(d) ? "bg-surface-2/60" : ""} ${over === cell ? "bg-accent-soft" : ""}`}
                        onDragOver={(e) => {
                          if (!canEdit) return;
                          e.preventDefault();
                          setOver(cell);
                        }}
                        onDragLeave={() => setOver((o) => (o === cell ? null : o))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setOver(null);
                          const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}") as { id?: string; offset?: number };
                          if (data.id) move(data.id, key, addDays(d, -(data.offset ?? 0)));
                        }}
                      >
                        {here.map((s) => (
                          <div
                            key={s.id}
                            draggable={canEdit}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/json", JSON.stringify({ id: s.id, offset: daysBetween(s.start, d) }));
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            title={`${s.title}${s.city ? `, ${s.city}` : ""} (du ${s.start} au ${s.end})${s.conflict ? " : conflit" : ""}`}
                            className={`mb-0.5 truncate rounded px-1.5 py-1 text-xs ${canEdit ? "cursor-grab" : ""} ${
                              s.conflict ? "border border-danger bg-danger-soft text-danger" : "bg-accent-soft text-accent"
                            }`}
                          >
                            {compact ? s.title.slice(0, 3) : s.title}
                            {s.conflict ? <span className="sr-only"> (conflit)</span> : null}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Job = { id: string; title: string };

export function AssignForm({ jobs, resources, defaultStart }: { jobs: Job[]; resources: Resource[]; defaultStart: string }) {
  const [state, run] = useActionState(assignAction, null);
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto] lg:items-end">
      <div>
        <label className="label" htmlFor="as-job">
          Chantier
        </label>
        <select id="as-job" name="jobId" className="field" required>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="as-res">
          Personne ou véhicule
        </label>
        <select id="as-res" name="resource" className="field" required>
          {resources.map((r) => (
            <option key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>
              {r.name} ({r.detail})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="as-start">
          Du
        </label>
        <input id="as-start" name="start" type="date" className="field" defaultValue={defaultStart} required />
      </div>
      <div>
        <label className="label" htmlFor="as-end">
          Au
        </label>
        <input id="as-end" name="end" type="date" className="field" defaultValue={defaultStart} />
      </div>
      <Submit pendingLabel="Enregistrement...">
        <Icon name="plus" size={16} /> Affecter
      </Submit>
      <div className="sm:col-span-2 lg:col-span-5">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Modification au clavier (alternative au glisser-déposer) : ressource, début, ou retrait. */
export function SlotEditor({ slot, resources }: { slot: Slot; resources: Resource[] }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <ActionForm action={moveAssignmentAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={slot.id} />
        <select
          name="resource"
          className="field w-auto"
          defaultValue={`${slot.resourceType}:${slot.resourceId}`}
          aria-label={`Ressource pour ${slot.title}`}
        >
          {resources.map((r) => (
            <option key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>
              {r.name}
            </option>
          ))}
        </select>
        <input name="start" type="date" className="field w-auto" defaultValue={slot.start} aria-label={`Nouveau début pour ${slot.title}`} />
        <Submit className="btn-secondary min-h-9 py-1">Déplacer</Submit>
      </ActionForm>
      <ActionForm action={deleteAssignmentAction} className="inline">
        <input type="hidden" name="id" value={slot.id} />
        <button className="btn-ghost min-h-9 px-2" aria-label={`Retirer l'affectation ${slot.title}`}>
          <Icon name="trash" size={16} />
        </button>
      </ActionForm>
    </div>
  );
}

export function VehicleForm({ vehicles }: { vehicles: Resource[] }) {
  return (
    <div className="space-y-3">
      <ActionForm action={vehicleAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
        <div>
          <label className="label" htmlFor="v-name">
            Véhicule
          </label>
          <input id="v-name" name="name" className="field" placeholder="Fourgon" required />
        </div>
        <div>
          <label className="label" htmlFor="v-plate">
            Immatriculation
          </label>
          <input id="v-plate" name="plate" className="field w-36" placeholder="AB-123-CD" />
        </div>
        <Submit className="btn-secondary">Ajouter</Submit>
      </ActionForm>
      {vehicles.length ? (
        <ul className="divide-y divide-line text-sm">
          {vehicles.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-1.5">
              <span>
                {v.name} <span className="text-muted">{v.detail}</span>
              </span>
              <ActionForm action={vehicleAction} className="inline">
                <input type="hidden" name="deleteId" value={v.id} />
                <button className="btn-ghost px-2" aria-label={`Retirer le véhicule ${v.name}`}>
                  <Icon name="trash" size={16} />
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
