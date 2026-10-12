"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";
import { formatUnitPrice } from "@/lib/calc/format";

interface Row {
  itemId: string;
  name: string;
  reference: string;
  unit: string;
  quantity: string;
  unitPrice4: number;
}

interface Option {
  id: string;
  name: string;
  reference: string;
  unit: string;
  unit_price4: number;
  kind: string;
}

function toMilli(q: string): number {
  const n = Number(q.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
}

/** Édition de la composition d'un ouvrage : prestations simples et quantités par unité. */
export function Composition({
  itemId,
  unit,
  initial,
  disabled,
}: {
  itemId: string;
  unit: string;
  initial: { child_id: string; name: string; reference: string; unit: string; quantity: string; unit_price4: number }[];
  disabled?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    initial.map((c) => ({ itemId: c.child_id, name: c.name, reference: c.reference, unit: c.unit, quantity: c.quantity, unitPrice4: c.unit_price4 })),
  );
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ items: Option[] }>(`/api/catalog-items?q=${encodeURIComponent(q)}&limit=20&sort=usage`);
        setOptions(r.items.filter((i) => i.id !== itemId && i.kind !== "ouvrage"));
      } catch {
        setOptions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, itemId]);

  const total4 = useMemo(() => rows.reduce((sum, r) => sum + Math.round((r.unitPrice4 * toMilli(r.quantity)) / 1000), 0), [rows]);

  const add = (o: Option) => {
    if (rows.some((r) => r.itemId === o.id)) return;
    setRows((rs) => [...rs, { itemId: o.id, name: o.name, reference: o.reference, unit: o.unit, quantity: "1", unitPrice4: o.unit_price4 }]);
    setQ("");
    setOptions([]);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/catalog-items/${itemId}/components`, {
        method: "PUT",
        json: { components: rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })) },
      });
      setMessage({ ok: true, text: rows.length ? "Composition enregistrée, prix recalculé." : "Composition retirée." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Enregistrement impossible" });
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <p className="text-sm text-muted">{disabled}</p>;

  return (
    <div className="space-y-3">
      {rows.length ? (
        <ul className="divide-y divide-line rounded-md border border-line">
          {rows.map((r, i) => (
            <li key={r.itemId} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-muted">
                  {r.reference}, {formatUnitPrice(r.unitPrice4)} / {r.unit}
                </div>
              </div>
              <label className="sr-only" htmlFor={`cq-${r.itemId}`}>
                Quantité de {r.name} par {unit}
              </label>
              <input
                id={`cq-${r.itemId}`}
                className="field-xs w-20 text-right"
                inputMode="decimal"
                value={r.quantity}
                onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
              />
              <span className="w-10 text-xs text-muted">{r.unit}</span>
              <button
                type="button"
                className="btn-ghost min-h-8 px-2 text-danger"
                aria-label={`Retirer ${r.name}`}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Ajoutez des prestations pour transformer celle-ci en ouvrage : son prix devient la somme des composants et suit leurs changements de prix.
        </p>
      )}
      <div className="relative">
        <label className="label" htmlFor="comp-search">
          Ajouter un composant
        </label>
        <input id="comp-search" className="field" placeholder="Rechercher dans le catalogue" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {options.length ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-surface shadow-lg">
            {options.map((o) => (
              <li key={o.id}>
                <button type="button" className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => add(o)}>
                  <span className="truncate">{o.name}</span>
                  <span className="tabular shrink-0 text-muted">
                    {formatUnitPrice(o.unit_price4)} / {o.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          Prix calculé : <strong className="tabular">{formatUnitPrice(total4)}</strong> / {unit}
        </div>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Enregistrement..." : "Enregistrer la composition"}
        </button>
      </div>
      {message ? (
        <p className={`text-sm ${message.ok ? "text-success" : "text-danger"}`} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
