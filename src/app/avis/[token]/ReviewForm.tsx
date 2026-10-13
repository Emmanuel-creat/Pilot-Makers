"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

export function ReviewForm({ token, orgName }: { token: string; orgName: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/public/avis/${token}`, { method: "POST", json: { rating, comment, publish } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Envoi impossible, réessayez dans un instant");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="flex items-center gap-2 text-success">
        <Icon name="check" /> Merci, votre avis a bien été transmis à {orgName}.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="label">Votre note</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-md border px-3 ${rating >= n ? "border-accent bg-accent-soft" : "border-line"}`}
            >
              <input type="radio" name="rating" value={n} className="sr-only" checked={rating === n} onChange={() => setRating(n)} />
              <Icon name="star" size={18} className={rating >= n ? "text-accent" : "text-muted"} />
              <span className="tabular">{n}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">1 : pas satisfait, 5 : très satisfait.</p>
      </fieldset>
      <div>
        <label className="label" htmlFor="rv-comment">
          Votre avis (facultatif)
        </label>
        <textarea
          id="rv-comment"
          rows={5}
          className="field"
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ex. : chantier propre, délais tenus, bons conseils pour le choix du carrelage."
        />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        <span>J&apos;accepte que mon avis soit publié sur la page de {orgName}, avec mon prénom, l&apos;initiale de mon nom et ma ville.</span>
      </label>
      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy || !rating}>
        <Icon name="send" size={16} /> Envoyer mon avis
      </button>
    </form>
  );
}
