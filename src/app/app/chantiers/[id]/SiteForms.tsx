"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { deleteJournalAction, liftReserveAction, signReceptionAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { SignaturePad } from "@/components/SignaturePad";

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

/** Réduit la photo (1 600 px au plus, JPEG) avant l'envoi : rapide même avec un réseau faible. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

function position(): Promise<GeolocationPosition | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }),
  );
}

export function JournalForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [geo, setGeo] = useState(true);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          const fd = new FormData(e.currentTarget);
          const file = fd.get("photo");
          const body = new FormData();
          body.set("note", String(fd.get("note") ?? ""));
          if (file instanceof File && file.size) {
            body.set("photo", await shrink(file), "photo.jpg");
            body.set("takenAt", new Date(file.lastModified || Date.now()).toISOString());
          } else body.set("takenAt", new Date().toISOString());
          const pos = geo ? await position() : null;
          if (pos) {
            body.set("latitude", String(pos.coords.latitude));
            body.set("longitude", String(pos.coords.longitude));
          }
          const res = await fetch(`/api/jobs/${jobId}/journal`, { method: "POST", body });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Envoi impossible");
          form.current?.reset();
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="journal-photo">
          Photo
        </label>
        <input id="journal-photo" name="photo" type="file" accept="image/*" capture="environment" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="journal-note">
          Note
        </label>
        <textarea id="journal-note" name="note" rows={2} className="field" placeholder="Ce qui a été fait, un problème rencontré..." />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={geo} onChange={(e) => setGeo(e.target.checked)} /> Enregistrer la position
      </label>
      <button className="btn-primary" disabled={busy}>
        <Icon name="upload" size={16} /> {busy ? "Envoi..." : "Ajouter au journal"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteJournal({ entryId }: { entryId: string }) {
  return (
    <ActionForm action={deleteJournalAction} className="inline">
      <input type="hidden" name="entryId" value={entryId} />
      <button className="btn-ghost px-2" aria-label="Supprimer cet élément du journal">
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Signature et réception                                              */
/* ------------------------------------------------------------------ */

type ReserveRow = { key: number; label: string; location: string; due: string };

export function ReceptionForm({
  jobId,
  defaultPlace,
  defaultClient,
  defaultCompany,
}: {
  jobId: string;
  defaultPlace: string;
  defaultClient: string;
  defaultCompany: string;
}) {
  const [state, run] = useActionState(signReceptionAction, null);
  const [decision, setDecision] = useState("sans_reserve");
  const [rows, setRows] = useState<ReserveRow[]>([{ key: 0, label: "", location: "", due: "" }]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      action={run}
      className="space-y-4"
      onSubmit={(e) => {
        if (!confirm("Signer le procès-verbal ? Il sera figé et ne pourra plus être modifié.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <fieldset>
        <legend className="label">Décision du client</legend>
        <div className="flex flex-wrap gap-2">
          {[
            ["sans_reserve", "Réception sans réserve"],
            ["avec_reserves", "Réception avec réserves"],
            ["refus", "Refus de réception"],
          ].map(([v, l]) => (
            <label key={v} className={`btn-secondary cursor-pointer ${decision === v ? "border-accent bg-accent-soft" : ""}`}>
              <input type="radio" name="decision" value={v} checked={decision === v} onChange={() => setDecision(v)} className="accent-accent" /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rec-date">
            Date de réception
          </label>
          <input id="rec-date" name="date" type="date" className="field" defaultValue={today} max={today} required />
        </div>
        <div>
          <label className="label" htmlFor="rec-place">
            Fait à
          </label>
          <input id="rec-place" name="place" className="field" defaultValue={defaultPlace} />
        </div>
      </div>
      {decision === "avec_reserves" ? (
        <fieldset className="space-y-2">
          <legend className="label">Réserves</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-2 sm:grid-cols-[2fr_1fr_150px_auto]">
              <input name="reserve_label" className="field" placeholder="Défaut constaté" aria-label={`Réserve ${i + 1}`} defaultValue={r.label} />
              <input name="reserve_location" className="field" placeholder="Localisation" aria-label={`Localisation de la réserve ${i + 1}`} />
              <input name="reserve_due" type="date" className="field" aria-label={`Délai de levée de la réserve ${i + 1}`} min={today} />
              <button
                type="button"
                className="btn-ghost px-2"
                aria-label={`Retirer la réserve ${i + 1}`}
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => setRows([...rows, { key: Date.now(), label: "", location: "", due: "" }])}
          >
            <Icon name="plus" size={16} /> Ajouter une réserve
          </button>
        </fieldset>
      ) : null}
      {decision === "refus" ? (
        <div>
          <label className="label" htmlFor="rec-refusal">
            Motif du refus
          </label>
          <textarea id="rec-refusal" name="refusalReason" rows={2} className="field" required />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div>
            <label className="label" htmlFor="rec-client">
              Nom du client signataire
            </label>
            <input id="rec-client" name="clientName" className="field" defaultValue={defaultClient} required />
          </div>
          <SignaturePad name="clientSignature" label="Signature du client" />
        </div>
        <div className="space-y-2">
          <div>
            <label className="label" htmlFor="rec-company">
              Pour l'entreprise
            </label>
            <input id="rec-company" name="companyName" className="field" defaultValue={defaultCompany} required />
          </div>
          <SignaturePad name="companySignature" label="Signature de l'entreprise" />
        </div>
      </div>
      <Submit pendingLabel="Signature...">Signer le procès-verbal</Submit>
      <FormMessage state={state} />
    </form>
  );
}

export function LiftReserveForm({ reserveId, label }: { reserveId: string; label: string }) {
  return (
    <ActionForm action={liftReserveAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="reserveId" value={reserveId} />
      <input
        name="note"
        className="field min-w-40 flex-1"
        placeholder="Travaux réalisés (facultatif)"
        aria-label={`Commentaire de levée : ${label}`}
      />
      <Submit className="btn-secondary" pendingLabel="Enregistrement...">
        <Icon name="check" size={16} /> Lever
      </Submit>
    </ActionForm>
  );
}
