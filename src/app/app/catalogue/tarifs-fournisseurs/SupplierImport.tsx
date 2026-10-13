"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { apiFetch, ApiError } from "@/components/editor/api";
import { formatPercent, formatUnitPrice } from "@/lib/calc/format";
import type { CostChange } from "@/lib/services/supplier-prices";

interface Result {
  supplier: string;
  lines: number;
  errors: { line: number; message: string }[];
  linked: number;
  unchanged: number;
  changes: CostChange[];
  increases: number;
  alerts: number;
  applied: boolean;
}

function toBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** Import d'un fichier de prix fournisseur en deux temps : aperçu des prix d'achat modifiés, puis application. */
export function SupplierImport({ suppliers }: { suppliers: string[] }) {
  const [supplier, setSupplier] = useState(suppliers[0] ?? "");
  const [margin, setMargin] = useState("20");
  const [file, setFile] = useState<{ data: string; name: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (commit: boolean) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await apiFetch<Result>("/api/catalog-items/supplier-prices", {
          method: "POST",
          json: { file: file.data, name: file.name, supplier, minMarginPercent: margin, commit },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div>
            <label className="label" htmlFor="sp-supplier">
              Fournisseur
            </label>
            <input
              id="sp-supplier"
              className="field"
              list="sp-suppliers"
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                setResult(null);
              }}
            />
            <datalist id="sp-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="sp-margin">
              Alerte sous une marge de (%)
            </label>
            <input id="sp-margin" inputMode="decimal" className="field" value={margin} onChange={(e) => setMargin(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="sp-file">
            Fichier de prix (.csv, .xlsx ou .ods)
          </label>
          <input
            id="sp-file"
            type="file"
            accept=".csv,.txt,.xlsx,.ods"
            className="block text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResult(null);
              setFile(f ? { data: await toBase64(f), name: f.name } : null);
            }}
          />
          <p className="mt-1 text-xs text-muted">
            Colonnes reconnues : référence (ou code article, REFCIALE), EAN, libellé, unité, prix net, ou prix public et remise. Les articles du catalogue de ce
            fournisseur sont reliés par leur référence chez le fournisseur.
          </p>
        </div>
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <Icon name="alert" size={16} /> {error}
          </p>
        ) : null}
        <button type="button" className="btn-primary" disabled={!file || busy || supplier.trim().length < 2} onClick={() => send(false)}>
          <Icon name="eye" size={16} /> Voir les changements
        </button>
      </div>

      {result ? (
        <section className="card space-y-3 p-5" aria-live="polite">
          <h2 className="font-semibold">{result.applied ? "Prix d'achat mis à jour" : "Aperçu"}</h2>
          <p className="text-sm">
            {result.lines} ligne(s) lue(s), {result.linked} article(s) du catalogue relié(s) à {result.supplier}, {result.changes.length} prix d'achat{" "}
            {result.applied ? "modifié(s)" : "à modifier"}, dont {result.increases} hausse(s). {result.unchanged ? `${result.unchanged} prix inchangé(s).` : ""}
          </p>
          {result.alerts ? (
            <p className="flex items-center gap-2 rounded-md bg-warning-soft p-2 text-sm">
              <Icon name="alert" size={16} /> {result.alerts} article(s) passent sous la marge de {margin} % : revoyez leur prix de vente.
            </p>
          ) : null}
          {result.changes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Article</th>
                    <th className="px-2 py-1 text-right font-medium">Ancien coût</th>
                    <th className="px-2 py-1 text-right font-medium">Nouveau coût</th>
                    <th className="px-2 py-1 text-right font-medium">Prix de vente</th>
                    <th className="py-1 pl-2 text-right font-medium">Marge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.changes.map((c) => (
                    <tr key={c.itemId}>
                      <td className="py-1.5 pr-2">
                        <Link className="link" href={`/app/catalogue/${c.itemId}`}>
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted">{c.supplierRef}</div>
                      </td>
                      <td className="tabular px-2 py-1.5 text-right">{c.oldCost4 === null ? "" : formatUnitPrice(c.oldCost4)}</td>
                      <td className={`tabular px-2 py-1.5 text-right ${c.oldCost4 !== null && c.newCost4 > c.oldCost4 ? "text-danger" : "text-success"}`}>
                        {formatUnitPrice(c.newCost4)}
                      </td>
                      <td className="tabular px-2 py-1.5 text-right">{formatUnitPrice(c.price4)}</td>
                      <td className={`tabular py-1.5 pl-2 text-right ${c.alert ? "font-semibold text-danger" : ""}`}>
                        {c.marginBp === null ? "" : formatPercent(c.marginBp)}
                        {c.alert ? <Icon name="alert" size={14} className="ml-1 inline" /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {result.errors.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer">{result.errors.length} ligne(s) ignorée(s)</summary>
              <ul className="mt-1 text-xs text-muted">
                {result.errors.map((e) => (
                  <li key={e.line}>
                    Ligne {e.line} : {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {!result.applied ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => send(true)}>
              <Icon name="check" size={16} /> Appliquer les nouveaux prix d'achat
            </button>
          ) : (
            <Link className="btn-secondary" href="/app/catalogue">
              Retour au catalogue
            </Link>
          )}
        </section>
      ) : null}
    </div>
  );
}
