"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { apiFetch, ApiError } from "@/components/editor/api";
import { formatEuros } from "@/lib/calc/format";
import { REFUSAL_REASONS } from "@/lib/services/refusal";

export function ClientResponse({
  token,
  number,
  version,
  ttc,
  withdrawal = false,
  vatAttestation = "",
}: {
  token: string;
  number: string;
  version: number;
  ttc: number;
  /** Délai de rétractation de 14 jours applicable */
  withdrawal?: boolean;
  /** Texte de l'attestation de TVA réduite, vide si aucun taux réduit */
  vatAttestation?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"accept" | "refuse" | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [attest, setAttest] = useState(false);
  const [earlyStart, setEarlyStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/public/quotes/${token}/respond`, {
        method: "POST",
        json: { decision: mode, name, consent, reason, vatAttestation: attest, earlyStart, ...(mode === "refuse" && reasonCode ? { reasonCode } : {}) },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (!mode) {
    return (
      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">Ce devis vous convient ? Vous pouvez répondre directement en ligne.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setMode("refuse")}>
            Refuser
          </button>
          <button type="button" className="btn-primary" onClick={() => setMode("accept")}>
            <Icon name="check" size={16} /> Accepter le devis
          </button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="font-semibold">{mode === "accept" ? "Accepter le devis" : "Refuser le devis"}</h2>
      <div>
        <label className="label" htmlFor="r-name">
          Vos nom et prénom
        </label>
        <input id="r-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
      </div>
      {mode === "accept" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>
            Bon pour accord : j'accepte le devis {number} (version {version}) d'un montant de{" "}
            <strong className="tabular">{formatEuros(ttc)} TTC</strong>, ainsi que ses conditions.
          </span>
        </label>
      ) : null}
      {mode === "accept" && vatAttestation ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={attest} onChange={(e) => setAttest(e.target.checked)} required />
          <span>
            <strong>J'atteste les conditions du taux réduit de TVA :</strong> {vatAttestation}
          </span>
        </label>
      ) : null}
      {mode === "accept" && withdrawal ? (
        <div className="space-y-2 rounded-md bg-surface-2 p-3 text-sm">
          <p>
            Vous disposez de 14 jours après votre acceptation pour vous rétracter, sans justification, avec le formulaire joint au devis ou par tout
            écrit. Aucun paiement ne peut vous être demandé avant 7 jours.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={earlyStart} onChange={(e) => setEarlyStart(e.target.checked)} />
            <span>
              Je demande que les travaux commencent avant la fin du délai de rétractation (facultatif). Si je me rétracte ensuite, je paierai les
              travaux déjà réalisés.
            </span>
          </label>
        </div>
      ) : null}
      {mode === "refuse" ? (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="r-code">
              Raison principale (facultatif)
            </label>
            <select id="r-code" className="field" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">Je préfère ne pas répondre</option>
              {Object.entries(REFUSAL_REASONS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <label className="label" htmlFor="r-reason">
            Précisions (facultatif)
          </label>
          <textarea id="r-reason" rows={3} className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Votre réponse est enregistrée avec la date, l'heure, votre adresse IP et l'empreinte du document consulté, afin de servir de preuve. Il ne
        s'agit pas d'une signature électronique qualifiée.
      </p>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => setMode(null)}>
          Retour
        </button>
        <button
          className={mode === "accept" ? "btn-primary" : "btn-danger"}
          disabled={busy || name.trim().length < 2 || (mode === "accept" && (!consent || (Boolean(vatAttestation) && !attest)))}
        >
          {busy ? "Envoi..." : mode === "accept" ? "Confirmer l'acceptation" : "Confirmer le refus"}
        </button>
      </div>
    </form>
  );
}
