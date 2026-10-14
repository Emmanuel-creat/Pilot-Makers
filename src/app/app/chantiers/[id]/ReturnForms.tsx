"use client";

import { collectReturnAction, createReturnAction, creditReturnAction, deleteReturnAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { RETURN_REASONS } from "@/lib/supplier-returns";

type Ids = { jobId: string; orderId: string };

/** Déclaration d'un retour : article reçu, quantité, motif, frais de reprise pour un surplus. */
export function ReturnForm({ ids, lines }: { ids: Ids; lines: { id: string; label: string; unit: string; returnable: string }[] }) {
  return (
    <ActionForm action={createReturnAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="jobId" value={ids.jobId} />
      <input type="hidden" name="orderId" value={ids.orderId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="rt-line">
            Article retourné
          </label>
          <select id="rt-line" name="lineId" className="field" required>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} (jusqu&apos;à {l.returnable.replace(".", ",")} {l.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rt-qty">
            Quantité retournée
          </label>
          <input id="rt-qty" name="quantity" className="field" inputMode="decimal" required />
        </div>
        <div>
          <label className="label" htmlFor="rt-reason">
            Motif
          </label>
          <select id="rt-reason" name="reason" className="field" required>
            {Object.entries(RETURN_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rt-fee">
            Frais de reprise (%)
          </label>
          <input id="rt-fee" name="restocking" className="field" inputMode="decimal" placeholder="0" aria-describedby="rt-fee-help" />
          <p id="rt-fee-help" className="mt-1 text-xs text-muted">
            Retenus seulement sur un surplus.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="rt-notes">
            Remarque
          </label>
          <input id="rt-notes" name="notes" className="field" maxLength={500} />
        </div>
      </div>
      <Submit className="btn-secondary" pendingLabel="Enregistrement...">
        <Icon name="undo" size={16} /> Déclarer le retour
      </Submit>
    </ActionForm>
  );
}

/** Suite d'un retour : reprise par le fournisseur, puis avoir. */
export function ReturnSteps({
  id,
  label,
  status,
  today,
  expected,
}: {
  id: string;
  label: string;
  status: "a_reprendre" | "repris";
  today: string;
  expected: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {status === "a_reprendre" ? (
        <ActionForm action={collectReturnAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <div>
            <label className="label" htmlFor={`col-${id}`}>
              Repris le
            </label>
            <input id={`col-${id}`} name="date" type="date" className="field" defaultValue={today} max={today} required />
          </div>
          <Submit className="btn-secondary">Repris par le fournisseur</Submit>
        </ActionForm>
      ) : null}
      <ActionForm action={creditReturnAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="date" value={today} />
        <div>
          <label className="label" htmlFor={`cr-${id}`}>
            Avoir HT (euros)
          </label>
          <input id={`cr-${id}`} name="amount" className="field w-32" inputMode="decimal" defaultValue={expected} required />
        </div>
        <div>
          <label className="label" htmlFor={`crr-${id}`}>
            N° d&apos;avoir
          </label>
          <input id={`crr-${id}`} name="reference" className="field w-32" maxLength={80} />
        </div>
        <Submit className="btn-secondary">Avoir reçu</Submit>
      </ActionForm>
      {status === "a_reprendre" ? (
        <form action={deleteReturnAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="inline-flex min-h-9 min-w-9 items-center justify-center text-muted hover:text-danger"
            aria-label={`Supprimer le retour ${label}`}
          >
            <Icon name="trash" size={16} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
