"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { apiFetch, ApiError } from "@/components/editor/api";
import { IMPORT_FIELDS, type ImportColumn } from "@/lib/import-fields";

export interface PreviewRow {
  line: number;
  ok: boolean;
  label: string;
  message: string;
}

/**
 * Import en deux temps : aperçu ligne par ligne, puis confirmation.
 * Le fichier (CSV, Excel .xlsx ou LibreOffice .ods) est transmis tel quel, en base64 :
 * le serveur détecte le format et l'encodage.
 */

function toBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
export function CsvImport({
  endpoint,
  kind,
  backHref,
  example,
}: {
  endpoint: string;
  kind: "customers" | "catalog";
  backHref: string;
  example: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [columns, setColumns] = useState<ImportColumn[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [other, setOther] = useState(false);

  const preview = async (data: string, fileName: string, map: Record<string, string> = mapping) => {
    setBusy(true);
    setError("");
    setRows(null);
    try {
      type Extra = { columns?: ImportColumn[]; looksLikeOther?: boolean; problem?: string };
      const keep = (r: Extra) => {
        setColumns(r.columns ?? []);
        setOther(!!r.looksLikeOther);
        setProblem(r.problem ?? "");
      };
      if (kind === "customers") {
        const r = await apiFetch<Extra & { rows: { line: number; data: Record<string, string> | null; errors: string[]; duplicateOf: string | null }[] }>(endpoint, {
          method: "POST",
          json: { file: data, name: fileName, mapping: map },
        });
        keep(r);
        setRows(
          r.rows.map((x) => ({
            line: x.line,
            ok: x.errors.length === 0,
            label: x.data ? [x.data.company_name, x.data.first_name, x.data.last_name].filter(Boolean).join(" ") || "(sans nom)" : "",
            message: x.errors.length ? x.errors.join(", ") : x.duplicateOf ? "Doublon probable d'un client existant" : "Prêt à importer",
          })),
        );
      } else {
        const r = await apiFetch<Extra & { results: { line: number; ok: boolean; message: string; reference?: string }[] }>(endpoint, {
          method: "POST",
          json: { file: data, name: fileName, mapping: map },
        });
        keep(r);
        setRows(r.results.map((x) => ({ line: x.line, ok: x.ok, label: x.reference ?? "", message: x.message })));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lecture impossible");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ imported: number; skipped?: number }>(endpoint, { method: "POST", json: { file, name, mapping, commit: true, skipDuplicates: skipDup } });
      setDone(`${r.imported} ligne(s) importée(s)${r.skipped ? `, ${r.skipped} ignorée(s)` : ""}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import impossible");
    } finally {
      setBusy(false);
    }
  };

  const okCount = rows?.filter((r) => r.ok && !(skipDup && r.message.startsWith("Doublon"))).length ?? 0;

  if (done) {
    return (
      <div className="card space-y-4 p-5">
        <p className="flex items-center gap-2 text-success">
          <Icon name="check" /> {done}
        </p>
        <button type="button" className="btn-primary" onClick={() => router.push(backHref)}>
          Terminer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-line px-4 py-8 text-center hover:border-accent">
          <Icon name="upload" size={24} className="text-muted" />
          <span className="font-medium">{name || "Choisir un fichier CSV, Excel ou LibreOffice"}</span>
          <span className="text-sm text-muted">Formats .csv, .xlsx et .ods, première feuille du classeur. 5 000 lignes maximum.</span>
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 5_000_000) {
                setError("Fichier trop volumineux (5 Mo maximum)");
                return;
              }
              const data = await toBase64(f);
              setName(f.name);
              setFile(data);
              setMapping({});
              preview(data, f.name, {});
            }}
          />
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Format attendu</summary>
          <p className="mt-2 text-muted">
            Les colonnes sont reconnues d&apos;après leur titre, y compris dans les exports des autres logiciels de devis et de gestion
            (par exemple « Désignation », « Prix unitaire HT », « Raison sociale », « Code postal »). Une colonne non reconnue peut être
            désignée à la main après la lecture du fichier.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-surface-2 p-3 text-xs">{example}</pre>
        </details>
      </div>
      {busy && !rows ? <p className="text-sm text-muted">Analyse du fichier...</p> : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {other ? (
        <p className="text-sm text-warning" role="status">
          Ce fichier ressemble plutôt à {kind === "customers" ? "un catalogue d'articles" : "une liste de clients"} :{" "}
          <a className="link" href={kind === "customers" ? "/app/catalogue/import" : "/app/clients/import"}>
            ouvrir l&apos;import {kind === "customers" ? "du catalogue" : "des clients"}
          </a>
          .
        </p>
      ) : null}
      {columns.length ? (
        <details className="card p-4" open={!!problem || columns.some((c) => !c.field)}>
          <summary className="cursor-pointer text-sm font-medium">
            Correspondance des colonnes : {columns.filter((c) => c.field).length} reconnue(s) sur {columns.length}
          </summary>
          {problem ? <p className="mt-2 text-sm text-danger">{problem}. Indiquez ci-dessous à quoi correspondent vos colonnes.</p> : null}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {columns.map((c) => (
              <li key={c.index} className="rounded-md border border-line p-2 text-sm">
                <label className="label" htmlFor={`col-${c.index}`}>
                  {c.header || `Colonne ${c.index + 1}`}
                  {c.sample ? <span className="block truncate text-xs font-normal text-muted">ex. {c.sample}</span> : null}
                </label>
                <select
                  id={`col-${c.index}`}
                  className="field"
                  value={mapping[c.index] ?? c.field ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    const next = { ...mapping, [c.index]: e.target.value };
                    setMapping(next);
                    preview(file, name, next);
                  }}
                >
                  <option value="">Ignorer cette colonne</option>
                  {IMPORT_FIELDS[kind].map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {rows && rows.length ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="text-sm">
              {rows.length} ligne(s) lue(s), <strong>{okCount}</strong> à importer
            </span>
            {kind === "customers" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                Ignorer les doublons probables
              </label>
            ) : null}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm">
            {rows.map((r) => (
              <li key={r.line} className="flex gap-3 px-4 py-2">
                <span className="w-14 shrink-0 text-muted">Ligne {r.line}</span>
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className={r.ok ? (r.message.startsWith("Doublon") ? "text-warning" : "text-success") : "text-danger"}>{r.message}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <button type="button" className="btn-secondary" onClick={() => router.push(backHref)}>
              Annuler
            </button>
            <button type="button" className="btn-primary" disabled={busy || okCount === 0} onClick={commit}>
              Importer {okCount} ligne(s)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
