"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { feedbackAction } from "@/app/actions";
import { Icon } from "@/components/Icon";

/** Question posée en bas de chaque page : les réponses sont regroupées chaque semaine pour améliorer l'application. */
export function PageFeedback() {
  const path = usePathname();
  return <FeedbackForm key={path} path={path} />;
}

function FeedbackForm({ path }: { path: string }) {
  const [state, run, pending] = useActionState(feedbackAction, null);
  if (state?.ok) {
    return (
      <p role="status" className="mx-auto mt-10 flex max-w-6xl items-center gap-2 px-4 pb-6 text-sm text-muted sm:px-6">
        <Icon name="check" size={16} /> {state.message}
      </p>
    );
  }
  return (
    <form action={run} className="mx-auto mt-10 w-full max-w-6xl px-4 pb-6 text-sm sm:px-6" aria-label="Votre avis sur cette page">
      <input type="hidden" name="path" value={path} />
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-muted">Cette page vous est-elle utile ?</span>
        <button name="useful" value="1" className="btn-ghost min-h-9" disabled={pending}>
          <Icon name="check" size={16} /> Utile
        </button>
        <button name="useful" value="0" className="btn-ghost min-h-9" disabled={pending}>
          <Icon name="edit" size={16} /> À améliorer
        </button>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-muted">Ajouter un commentaire (facultatif)</summary>
        <label htmlFor="pf-comment" className="sr-only">
          Votre avis en quelques mots
        </label>
        <textarea
          id="pf-comment"
          name="comment"
          rows={2}
          maxLength={1000}
          className="field mt-2"
          placeholder="Ce qui manque, ce qui gêne, ce qui vous aide..."
        />
      </details>
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
