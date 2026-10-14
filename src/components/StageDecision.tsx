"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";

/** Validation ou contestation d'une étape de paiement par le client, depuis son espace. */
export function StageDecision({ endpoint, stageId }: { endpoint: string; stageId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `etape-${stageId.slice(0, 8)}`;

  async function decide(decision: "validee" | "contestee") {
    setBusy(true);
    setError("");
    try {
      await apiFetch(endpoint, { method: "POST", json: { stageId, decision, comment } });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible, réessayez");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div>
        <label className="label" htmlFor={id}>
          Commentaire (obligatoire pour contester)
        </label>
        <textarea id={id} className="field" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide("validee")}>
          Valider l&apos;étape
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => decide("contestee")}>
          Contester
        </button>
      </div>
    </div>
  );
}
