"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { stageInvoiceAction, stagesDefineAction } from "@/app/actions";
import { apiFetch, ApiError } from "@/components/editor/api";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function PlanForm({ quoteId, rows }: { quoteId: string; rows: { label: string; percent: string }[] }) {
  const [count, setCount] = useState(Math.max(rows.length, 3));
  return (
    <ActionForm action={stagesDefineAction} className="space-y-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <div>
            <label className="label" htmlFor={`st-label-${i}`}>
              Étape {i + 1}
            </label>
            <input
              id={`st-label-${i}`}
              name={`label${i}`}
              className="field"
              maxLength={120}
              defaultValue={rows[i]?.label ?? ""}
              placeholder={i === 0 ? "Ex. : démolition et évacuation" : ""}
            />
          </div>
          <div>
            <label className="label" htmlFor={`st-pct-${i}`}>
              Avancement cumulé (%)
            </label>
            <input id={`st-pct-${i}`} name={`percent${i}`} className="field tabular" inputMode="decimal" defaultValue={rows[i]?.percent ?? ""} />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {count < 12 ? (
          <button type="button" className="btn-ghost" onClick={() => setCount(count + 1)}>
            Ajouter une étape
          </button>
        ) : null}
        <Submit className="btn-primary">Enregistrer le plan</Submit>
      </div>
    </ActionForm>
  );
}

export function SubmitStage({ stageId, hasEmail }: { stageId: string; hasEmail: boolean }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(hasEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = stageId.slice(0, 8);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return setError("Ajoutez au moins une photo de l'avancement");
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      for (const f of files) fd.append("photos", f, f.name);
      fd.set("note", note);
      fd.set("notify", notify ? "1" : "0");
      await apiFetch(`/api/etapes/${stageId}`, { method: "POST", body: fd });
      setFiles([]);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Envoi impossible, réessayez");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div>
        <label className="label" htmlFor={`ph-${id}`}>
          Photos de l&apos;avancement (JPEG ou PNG, 6 au plus)
        </label>
        <input
          id={`ph-${id}`}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          capture="environment"
          className="field"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))}
        />
      </div>
      <div>
        <label className="label" htmlFor={`note-${id}`}>
          Note pour le client
        </label>
        <textarea id={`note-${id}`} className="field" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} disabled={!hasEmail} onChange={(e) => setNotify(e.target.checked)} />
        Prévenir le client par e-mail avec le lien de son espace
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Envoi en cours..." : "Soumettre l'étape au client"}
      </button>
    </form>
  );
}

export function InvoiceStage({ stageId, final }: { stageId: string; final: boolean }) {
  return (
    <ActionForm action={stageInvoiceAction} className="mt-3">
      <input type="hidden" name="stageId" value={stageId} />
      <Submit className="btn-primary">{final ? "Émettre la facture de solde" : "Facturer l'étape"}</Submit>
    </ActionForm>
  );
}
