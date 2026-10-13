"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

export type ThreadMessage = {
  id: string;
  author_type: "client" | "entreprise";
  author_name: string;
  kind: "message" | "modification";
  line_label: string;
  body: string;
  handled: boolean;
  at: string;
};

/** Fil des échanges vu par le client, et formulaire : question ou demande de modification sur une ligne. */
export function ClientMessages({
  endpoint,
  quoteId,
  thread,
  lines,
  orgName,
  idPrefix = "cm",
}: {
  endpoint: string;
  quoteId?: string;
  thread: ThreadMessage[];
  lines: { id: string; label: string }[];
  orgName: string;
  idPrefix?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"message" | "modification">("message");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const p = idPrefix;
  return (
    <div className="space-y-4">
      {thread.length ? (
        <ol className="space-y-3">
          {thread.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${m.author_type === "entreprise" ? "border-accent/30 bg-accent-soft sm:mr-12" : "border-line bg-surface sm:ml-12"}`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span className="font-medium text-ink">
                  {m.author_type === "entreprise" ? `${m.author_name}, ${orgName}` : m.author_name || "Vous"}
                </span>
                <span>{m.at}</span>
              </div>
              {m.kind === "modification" ? (
                <p className="mb-1 text-xs font-medium">
                  Demande de modification : {m.line_label} {m.handled ? <span className="text-success">(prise en compte)</span> : null}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Aucun échange pour l'instant.</p>
      )}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          setBusy(true);
          setError("");
          setSent(false);
          try {
            await apiFetch(endpoint, {
              method: "POST",
              json: { quoteId, kind, body: fd.get("body"), name: fd.get("name"), lineId: kind === "modification" ? fd.get("lineId") : "" },
            });
            form.reset();
            setSent(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Envoi impossible");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend className="label">Votre message</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name={`${p}-kind`} className="h-4 w-4" checked={kind === "message"} onChange={() => setKind("message")} /> Question
            </label>
            {lines.length ? (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${p}-kind`}
                  className="h-4 w-4"
                  checked={kind === "modification"}
                  onChange={() => setKind("modification")}
                />{" "}
                Demande de modification sur une ligne
              </label>
            ) : null}
          </div>
        </fieldset>
        {kind === "modification" ? (
          <div>
            <label className="label" htmlFor={`${p}-line`}>
              Ligne concernée
            </label>
            <select id={`${p}-line`} name="lineId" className="field">
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor={`${p}-body`}>
            {kind === "modification" ? "Ce que vous souhaitez changer" : "Message"}
          </label>
          <textarea id={`${p}-body`} name="body" className="field min-h-24" maxLength={3000} required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-name`}>
            Votre nom (facultatif)
          </label>
          <input id={`${p}-name`} name="name" className="field" maxLength={120} autoComplete="name" />
        </div>
        <button className="btn-primary" disabled={busy}>
          <Icon name="send" size={16} /> {busy ? "Envoi..." : "Envoyer"}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : sent ? (
          <p role="status" className="text-sm text-success">
            Message envoyé. {orgName} vous répondra par e-mail.
          </p>
        ) : null}
      </form>
    </div>
  );
}
