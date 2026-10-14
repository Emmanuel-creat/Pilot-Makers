"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";

export function SpecUpload({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choisissez le CCTP");
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file, file.name);
      fd.set("title", title);
      fd.set("customerId", customerId);
      const r = await apiFetch<{ quoteId: string }>("/api/marches/cctp", { method: "POST", body: fd });
      router.push(`/app/devis/${r.quoteId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Document illisible : utilisez un fichier .docx, .odt, .pdf ou .txt");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="spec-file">
          Cahier des charges (CCTP en .docx, .odt, .pdf ou .txt)
        </label>
        <input id="spec-file" type="file" accept=".docx,.odt,.pdf,.txt" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <label className="label" htmlFor="spec-title">
          Objet des travaux
        </label>
        <input
          id="spec-title"
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. réfection des sanitaires de l'école"
        />
      </div>
      <div>
        <label className="label" htmlFor="spec-customer">
          Client
        </label>
        <select id="spec-customer" className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
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
        {busy ? "Lecture en cours..." : "Lire le CCTP et créer le devis"}
      </button>
    </form>
  );
}
