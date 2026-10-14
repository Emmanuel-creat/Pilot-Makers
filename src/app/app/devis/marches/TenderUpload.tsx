"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";

export function TenderUpload({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choisissez le fichier du marché");
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file, file.name);
      fd.set("title", title);
      fd.set("customerId", customerId);
      const r = await apiFetch<{ quoteId: string }>("/api/marches", { method: "POST", body: fd });
      router.push(`/app/devis/${r.quoteId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fichier illisible : utilisez un tableau .xlsx, .ods ou .csv");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="tender-file">
          Bordereau de l&apos;acheteur (DPGF, BPU ou DQE)
        </label>
        <input id="tender-file" type="file" accept=".xlsx,.ods,.csv" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <label className="label" htmlFor="tender-title">
          Objet du marché
        </label>
        <input
          id="tender-title"
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. réfection des sanitaires de l'école"
        />
      </div>
      <div>
        <label className="label" htmlFor="tender-customer">
          Acheteur
        </label>
        <select id="tender-customer" className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">À choisir plus tard</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Import en cours..." : "Importer et créer le devis"}
      </button>
    </form>
  );
}
