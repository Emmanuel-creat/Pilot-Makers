"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { apiFetch, ApiError } from "@/components/editor/api";
import { formatEuros } from "@/lib/calc/format";
import { acceptedCalc, snapshotOptions, snapshotVariants, type OptionCalcSource } from "@/lib/services/options";
import { REFUSAL_REASONS } from "@/lib/services/refusal";

export function ClientResponse({
  token,
  number,
  version,
  ttc,
  withdrawal = false,
  vatAttestation = "",
  optionSource = null,
}: {
  token: string;
  number: string;
  version: number;
  ttc: number;
  /** Délai de rétractation de 14 jours applicable */
  withdrawal?: boolean;
  /** Texte de l'attestation de TVA réduite, vide si aucun taux réduit */
  vatAttestation?: string;
  /** Lignes en option proposées au choix, null si le devis n'en contient pas */
  optionSource?: OptionCalcSource | null;
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
  const [chosen, setChosen] = useState<string[]>([]);
  const offered = useMemo(() => (optionSource ? snapshotOptions(optionSource) : []), [optionSource]);
  const variants = useMemo(() => (optionSource ? snapshotVariants(optionSource) : []), [optionSource]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const selection = useMemo(
    () => [...chosen, ...variants.map((g) => picks[g.name]).filter((id): id is string => !!id && variants.some((g) => g.choices.some((c) => c.id === id && !c.included)))],
    [chosen, picks, variants],
  );
  const total = useMemo(() => (optionSource ? acceptedCalc(optionSource, selection).totalTtcCents : ttc), [optionSource, selection, ttc]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/public/quotes/${token}/respond`, {
        method: "POST",
        json: {
          decision: mode,
          name,
          consent,
          reason,
          vatAttestation: attest,
          earlyStart,
          ...(mode === "refuse" && reasonCode ? { reasonCode } : {}),
          ...(mode === "accept" && (offered.length || variants.length) ? { options: selection } : {}),
        },
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
      {mode === "accept"
        ? variants.map((g) => (
            <fieldset key={g.name} className="space-y-2 rounded-md bg-surface-2 p-3 text-sm">
              <legend className="px-1 font-medium">Votre choix : {g.name}</legend>
              {g.choices.map((c) => (
                <label key={c.id} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`variante-${g.name}`}
                    className="mt-0.5 h-4 w-4"
                    checked={(picks[g.name] ?? g.choices[0].id) === c.id}
                    onChange={() => setPicks((p) => ({ ...p, [g.name]: c.id }))}
                  />
                  <span className="flex-1">{c.label}</span>
                  <span className="tabular shrink-0">{formatEuros(c.ttcCents)} TTC</span>
                </label>
              ))}
            </fieldset>
          ))
        : null}
      {mode === "accept" && offered.length ? (
        <fieldset className="space-y-2 rounded-md bg-surface-2 p-3 text-sm">
          <legend className="px-1 font-medium">Options proposées</legend>
          {offered.map((o) => (
            <label key={o.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={chosen.includes(o.id)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.id] : c.filter((x) => x !== o.id)))}
              />
              <span className="flex-1">{o.label}</span>
              <span className="tabular shrink-0">+ {formatEuros(o.ttcCents)} TTC</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {mode === "accept" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>
            Bon pour accord : j'accepte le devis {number} (version {version}) d'un montant de{" "}
            <strong className="tabular">{formatEuros(total)} TTC</strong>
            {variants.length ? `, ${variants.map((g) => `${g.name.toLowerCase()} : ${(g.choices.find((c) => c.id === picks[g.name]) ?? g.choices[0]).label}`).join(", ")}` : ""}
            {offered.length ? (chosen.length ? `, options cochées comprises` : ", sans option") : ""}, ainsi que ses conditions.
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
