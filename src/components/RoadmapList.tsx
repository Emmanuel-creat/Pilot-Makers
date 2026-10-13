"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

export interface RoadmapView {
  id: string;
  title: string;
  description: string;
  status: "idee" | "prevu" | "en_cours" | "livre";
  delivered_on: string | null;
  votes: number;
  voted?: boolean;
}

const LABELS = { en_cours: "En cours", prevu: "Prévu", idee: "À l'étude", livre: "Livré" } as const;
const ORDER = ["en_cours", "prevu", "idee", "livre"] as const;

/** Sujets de la feuille de route par statut ; le vote n'est proposé qu'aux personnes connectées. */
export function RoadmapList({ items, canVote }: { items: RoadmapView[]; canVote: boolean }) {
  const [state, setState] = useState(() => new Map(items.map((i) => [i.id, { votes: i.votes, voted: !!i.voted }])));
  const [error, setError] = useState("");
  const vote = async (id: string) => {
    setError("");
    try {
      const r = await apiFetch<{ voted: boolean; votes: number }>(`/api/roadmap/${id}/vote`, { method: "POST" });
      setState((m) => new Map(m).set(id, r));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Vote impossible");
    }
  };
  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {ORDER.map((st) => {
        const list = items.filter((i) => i.status === st);
        if (!list.length) return null;
        return (
          <section key={st} aria-labelledby={`rm-${st}`}>
            <h2 id={`rm-${st}`} className="mb-2 font-semibold">
              {LABELS[st]}
            </h2>
            <ul className="space-y-2">
              {list.map((it) => {
                const s = state.get(it.id)!;
                return (
                  <li key={it.id} className="card flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{it.title}</h3>
                      {it.description ? <p className="mt-0.5 text-sm whitespace-pre-line text-muted">{it.description}</p> : null}
                      {it.delivered_on ? <p className="mt-1 text-xs text-success">Livré le {it.delivered_on.split("-").reverse().join("/")}</p> : null}
                    </div>
                    {st === "livre" ? null : canVote ? (
                      <button
                        type="button"
                        className={`flex min-w-16 shrink-0 flex-col items-center rounded-md border px-2 py-1.5 text-sm ${s.voted ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
                        aria-pressed={s.voted}
                        aria-label={`${s.voted ? "Retirer mon vote pour" : "Voter pour"} ${it.title}, ${s.votes} vote(s)`}
                        onClick={() => vote(it.id)}
                      >
                        <Icon name="up" size={16} />
                        <span className="tabular font-semibold">{s.votes}</span>
                      </button>
                    ) : (
                      <span className="flex min-w-16 shrink-0 flex-col items-center text-sm text-muted">
                        <Icon name="up" size={16} />
                        <span className="tabular">{s.votes}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!items.length ? <p className="text-sm text-muted">Aucun sujet publié pour l'instant.</p> : null}
      {!canVote && items.length ? (
        <p className="text-sm">
          <Link className="link" href="/connexion?next=/app/feuille-de-route">
            Connectez-vous
          </Link>{" "}
          pour soutenir les sujets qui comptent pour vous.
        </p>
      ) : null}
    </div>
  );
}
