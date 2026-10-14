"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";

const MAX_SIDE = 2400;

/** Réduit le plan à 2400 points de côté au plus, en PNG (traits nets) ou JPEG s'il reste trop lourd. */
async function prepare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = (type: string, q?: number) => new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("image"))), type, q));
  const png = await blob("image/png");
  return png.size <= 3_800_000 ? png : blob("image/jpeg", 0.88);
}

export function PlanUpload({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choisissez l'image du plan");
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("image", await prepare(file), "plan.png");
      fd.set("name", name || file.name.replace(/\.[a-z0-9]+$/i, ""));
      const r = await apiFetch<{ id: string }>(`/api/quotes/${quoteId}/takeoffs`, { method: "POST", body: fd });
      router.push(`/app/devis/${quoteId}/metres/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Plan illisible : utilisez une image JPEG ou PNG");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="plan-file">
          Image du plan
        </label>
        <input id="plan-file" type="file" accept="image/png,image/jpeg" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <label className="label" htmlFor="plan-name">
          Nom du plan
        </label>
        <input id="plan-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. rez-de-chaussée" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Import en cours..." : "Importer le plan"}
      </button>
    </form>
  );
}
