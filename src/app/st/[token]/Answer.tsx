"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

/** Formulaire de réponse du sous-traitant : montant HT, délai, remarques et devis joint. */
export function Answer({ token, initial }: { token: string; initial: { amount: string; delay: string; note: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        setSent(false);
        try {
          const res = await fetch(`/api/public/st/${token}`, { method: "POST", body: new FormData(form) });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error((typeof j?.error === "string" ? j.error : null) ?? "Envoi impossible");
          }
          setSent(true);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Envoi impossible");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="st-amount">
            Montant hors taxes (euros)
          </label>
          <input id="st-amount" name="amount" className="field" inputMode="decimal" required defaultValue={initial?.amount ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="st-delay">
            Délai d'intervention
          </label>
          <input
            id="st-delay"
            name="delay"
            className="field"
            maxLength={200}
            placeholder="2 jours, semaine 46..."
            defaultValue={initial?.delay ?? ""}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="st-note">
          Remarques (facultatif)
        </label>
        <textarea id="st-note" name="note" className="field min-h-24" maxLength={3000} defaultValue={initial?.note ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="st-file">
            Votre devis (PDF, JPEG ou PNG, facultatif)
          </label>
          <input id="st-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="st-name">
            Votre nom
          </label>
          <input id="st-name" name="name" className="field" maxLength={120} autoComplete="name" />
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm">
          Merci, votre prix a bien été transmis.
        </p>
      ) : null}
      <button className="btn-primary" disabled={busy}>
        <Icon name="send" size={16} /> {busy ? "Envoi..." : initial ? "Mettre à jour mon prix" : "Envoyer mon prix"}
      </button>
    </form>
  );
}
