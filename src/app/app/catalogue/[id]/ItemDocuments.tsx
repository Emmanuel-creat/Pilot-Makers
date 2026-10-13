"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { apiFetch, ApiError } from "@/components/editor/api";

const KINDS: [string, string][] = [
  ["fiche_technique", "Fiche technique"],
  ["certificat", "Certificat ou avis technique"],
  ["notice", "Notice de pose"],
  ["fds", "Fiche de données de sécurité"],
  ["autre", "Autre document"],
];
const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? k;

interface Doc {
  id: string;
  kind: string;
  title: string;
  size: number;
}

/** Fiches techniques et certificats d'un article : proposés au client avec chaque devis qui l'utilise. */
export function ItemDocuments({ itemId, initial }: { itemId: string; initial: Doc[] }) {
  const [docs, setDocs] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const reload = async () => setDocs((await apiFetch<{ documents: Doc[] }>(`/api/catalog-items/${itemId}/documents`)).documents);

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h2 className="mb-1 font-semibold">Fiches techniques et certificats</h2>
      <p className="mb-3 text-sm text-muted">
        Documents PDF du fabricant. Chaque devis émis avec cet article les propose au client, réunis en un seul fichier, depuis son lien.
      </p>
      {docs.length ? (
        <ul className="mb-4 divide-y divide-line text-sm" data-testid="documents-article">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <a className="link inline-flex items-center gap-1" href={`/api/catalog-documents/${d.id}`} target="_blank" rel="noreferrer">
                <Icon name="note" size={16} /> {d.title}
              </a>
              <span className="text-xs text-muted">
                {kindLabel(d.kind)}, {Math.max(1, Math.round(d.size / 1024))} ko
              </span>
              <button
                type="button"
                className="link text-danger"
                onClick={async () => {
                  setError("");
                  try {
                    await apiFetch(`/api/catalog-documents/${d.id}`, { method: "DELETE" });
                    await reload();
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : "Retrait impossible");
                  }
                }}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        ref={form}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await apiFetch(`/api/catalog-items/${itemId}/documents`, { method: "POST", body: new FormData(e.currentTarget) });
            form.current?.reset();
            await reload();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Envoi impossible");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="doc-file">
            Document PDF (5 Mo au plus)
          </label>
          <input id="doc-file" name="file" type="file" accept="application/pdf" required className="field" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="doc-kind">
              Type
            </label>
            <select id="doc-kind" name="kind" className="field" defaultValue="fiche_technique">
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="doc-title">
              Titre
            </label>
            <input id="doc-title" name="title" className="field" maxLength={120} placeholder="Nom du fichier" />
          </div>
        </div>
        <button className="btn-secondary" disabled={busy}>
          <Icon name="upload" size={16} /> Joindre
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
