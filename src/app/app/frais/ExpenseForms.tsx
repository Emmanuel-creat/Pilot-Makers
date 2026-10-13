"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { deleteExpenseAction, reviewExpensesAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { eurosField, readInvoiceFile, setField } from "@/components/purchase-invoice";

/** Nouvelle note : photo du ticket prise avec le téléphone, montant et catégorie. */
export function ExpenseForm({ jobs, categories, today }: { jobs: { id: string; title: string }[]; categories: Record<string, string>; today: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [read, setRead] = useState<string | null>(null);

  /** Facture électronique (PDF Factur-X) : montants, date et fournisseur lus dans le XML joint. */
  async function readInvoice(file: File | undefined) {
    setRead(null);
    if (!file || file.type !== "application/pdf") return;
    const data = await readInvoiceFile(file);
    const f = form.current;
    if (!data || !f) return;
    setField(f, "amount", eurosField(data.totalCents));
    setField(f, "vat", eurosField(data.vatCents));
    if (data.issueDate && data.issueDate <= today) setField(f, "date", data.issueDate);
    setField(f, "merchant", data.supplier.slice(0, 120));
    setField(f, "note", data.number ? `Facture ${data.number}`.slice(0, 500) : "");
    setRead(`Facture électronique lue${data.number ? ` (n° ${data.number})` : ""} : vérifiez les montants préremplis.`);
  }

  return (
    <form
      ref={form}
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setDone(false);
        try {
          const res = await fetch("/api/expenses", {
            method: "POST",
            body: new FormData(e.currentTarget),
          });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Envoi impossible");
          form.current?.reset();
          setRead(null);
          setDone(true);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="sm:col-span-2">
        <label className="label" htmlFor="fr-photo">
          Photo du ticket
        </label>
        <input
          id="fr-photo"
          name="photo"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="field"
          aria-describedby="fr-photo-help"
          onChange={(e) => void readInvoice(e.currentTarget.files?.[0])}
        />
        <p id="fr-photo-help" className="mt-1 text-xs text-muted" role="status">
          {read ?? "Une facture électronique au format PDF (Factur-X) remplit seule le montant, la TVA, la date et le fournisseur."}
        </p>
      </div>
      <div>
        <label className="label" htmlFor="fr-amount">
          Montant TTC (euros)
        </label>
        <input id="fr-amount" name="amount" className="field" inputMode="decimal" placeholder="18,50" required />
      </div>
      <div>
        <label className="label" htmlFor="fr-vat">
          Dont TVA
        </label>
        <input id="fr-vat" name="vat" className="field" inputMode="decimal" placeholder="1,68" aria-describedby="fr-vat-help" />
        <p id="fr-vat-help" className="mt-1 text-xs text-muted">
          Indiquée sur le ticket ; laissez vide si absente.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="fr-date">
          Date
        </label>
        <input id="fr-date" name="date" type="date" className="field" defaultValue={today} max={today} required />
      </div>
      <div>
        <label className="label" htmlFor="fr-category">
          Catégorie
        </label>
        <select id="fr-category" name="category" className="field">
          {Object.entries(categories).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="fr-merchant">
          Commerçant
        </label>
        <input id="fr-merchant" name="merchant" className="field" maxLength={120} placeholder="Station, restaurant, magasin..." />
      </div>
      <div>
        <label className="label" htmlFor="fr-job">
          Chantier
        </label>
        <select id="fr-job" name="jobId" className="field">
          <option value="">Sans chantier</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Payé avec</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="payment" value="perso" defaultChecked className="h-4 w-4" /> Mon argent, à rembourser
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="payment" value="entreprise" className="h-4 w-4" /> La carte de l'entreprise
          </label>
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="fr-note">
          Note
        </label>
        <input id="fr-note" name="note" className="field" maxLength={500} />
      </div>
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={busy}>
          <Icon name="upload" size={16} /> {busy ? "Envoi..." : "Envoyer la note de frais"}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : done ? (
          <p role="status" className="mt-2 text-sm text-success">
            Note envoyée pour validation.
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteExpense({ id, label }: { id: string; label: string }) {
  return (
    <ActionForm action={deleteExpenseAction} className="">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost min-h-8 px-2 text-danger" aria-label={`Supprimer ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

type Row = {
  id: string;
  label: string;
  detail: string;
  status: string;
  statusLabel: string;
  photo: string | null;
};

/** Validation par l'encadrement : cocher puis valider, refuser, rouvrir ou marquer remboursé. */
export function ExpenseReview({ rows }: { rows: Row[] }) {
  const [state, act] = useActionState(reviewExpensesAction, null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (state?.ok) setChecked(new Set());
  }, [state]);
  const toggle = (id: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pending = rows.filter((r) => r.status === "soumis");
  return (
    <form action={act} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost min-h-8 text-sm" onClick={() => setChecked(new Set(pending.map((r) => r.id)))} disabled={!pending.length}>
          Tout cocher à valider ({pending.length})
        </button>
        <button type="button" className="btn-ghost min-h-8 text-sm" onClick={() => setChecked(new Set())} disabled={!checked.size}>
          Tout décocher
        </button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2">
            <input
              type="checkbox"
              name="ids"
              value={r.id}
              id={`ex-${r.id}`}
              className="mt-1 h-4 w-4"
              checked={checked.has(r.id)}
              onChange={() => toggle(r.id)}
            />
            <label htmlFor={`ex-${r.id}`} className="min-w-0 flex-1">
              <span className="font-medium">{r.label}</span>
              <span className="block text-xs text-muted">{r.detail}</span>
            </label>
            {r.photo ? (
              <a className="link shrink-0" href={r.photo} target="_blank" rel="noopener">
                Ticket
              </a>
            ) : (
              <span className="shrink-0 text-xs text-warning">Sans ticket</span>
            )}
            <span
              className={`shrink-0 ${r.status === "valide" || r.status === "rembourse" ? "text-success" : r.status === "refuse" ? "text-danger" : "text-warning"}`}
            >
              {r.statusLabel}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="ex-note">
            Raison en cas de refus
          </label>
          <input id="ex-note" name="note" className="field" maxLength={300} />
        </div>
        <button name="decision" value="valide" className="btn-primary" disabled={!checked.size}>
          <Icon name="check" size={16} /> Valider ({checked.size})
        </button>
        <button name="decision" value="refuse" className="btn-secondary" disabled={!checked.size}>
          Refuser
        </button>
        <button name="decision" value="rembourse" className="btn-secondary" disabled={!checked.size}>
          <Icon name="euro" size={16} /> Remboursé
        </button>
        <button name="decision" value="soumis" className="btn-ghost" disabled={!checked.size}>
          Rouvrir
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
