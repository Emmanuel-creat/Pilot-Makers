"use client";

import { useState } from "react";
import type { ExchangeValidation } from "@/lib/quote-exchange";

/** Vérifie un fichier Devis ouvert collé ou choisi, via le validateur public. Rien n'est conservé. */
export function Validator({ example }: { example: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExchangeValidation | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function check() {
    setPending(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/public/devis-ouvert/valider", { method: "POST", headers: { "content-type": "application/json" }, body: text });
      const body = await r.json();
      if (!r.ok) setError(body?.error?.message ?? "Vérification impossible pour le moment.");
      else setResult(body);
    } catch {
      setError("Vérification impossible pour le moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="dv-file">
          Fichier .devis.json
        </label>
        <input
          id="dv-file"
          type="file"
          accept=".json,application/json"
          className="field"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }}
        />
      </div>
      <div>
        <label className="label" htmlFor="dv-text">
          Ou contenu JSON collé
        </label>
        <textarea id="dv-text" rows={8} className="field font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!text.trim() || pending} onClick={check}>
          Vérifier le fichier
        </button>
        <button type="button" className="btn-ghost" onClick={() => setText(example)}>
          Utiliser l&apos;exemple
        </button>
      </div>
      <div role="status" data-testid="resultat-validation">
        {error ? <p className="text-danger">{error}</p> : null}
        {result ? (
          result.valid ? (
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-success">Fichier conforme au format Devis ouvert.</p>
              {result.summary ? (
                <p>
                  Devis {result.summary.number || "sans numéro"} de {result.summary.seller} : {result.summary.sections} lot(s), {result.summary.lines} ligne(s),{" "}
                  {result.summary.totalHt} € HT, {result.summary.totalTtc} € TTC.
                </p>
              ) : null}
              {result.warnings.map((w) => (
                <p key={w} className="text-warning">
                  {w}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-danger">Fichier non conforme :</p>
              <ul className="list-disc pl-5">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
