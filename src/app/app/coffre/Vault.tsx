"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { openFile, openName, passphraseIssue, sealFile, VAULT_MAX_BYTES, type VaultEnvelope } from "@/lib/vault";

interface Item {
  id: string;
  size: number;
  envelope: VaultEnvelope;
  createdAt: string;
  author: string;
}

const ko = (n: number) => `${Math.max(1, Math.round(n / 1024)).toLocaleString("fr-FR")} Ko`;

export function Vault({ initial, canEdit }: { initial: Item[]; canEdit: boolean }) {
  const [items, setItems] = useState(initial);
  const [pass, setPass] = useState("");
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function readNames(list: Item[], p: string) {
    const out: Record<string, string | null> = {};
    for (const it of list) out[it.id] = (await openName(p, it.envelope))?.name ?? null;
    return out;
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const issue = passphraseIssue(pass);
    if (issue) return setError(issue);
    setBusy(true);
    const n = await readNames(items, pass);
    setBusy(false);
    if (items.length && Object.values(n).every((x) => x === null)) return setError("Cette phrase secrète n'ouvre aucune pièce du coffre.");
    setNames(n);
    setUnlocked(true);
  }

  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    if (file.size > VAULT_MAX_BYTES) return setError("Fichier trop lourd (10 Mo au plus)");
    setBusy(true);
    try {
      const { envelope, cipher } = await sealFile(pass, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      const fd = new FormData();
      fd.set("envelope", JSON.stringify(envelope));
      fd.set("cipher", new Blob([cipher as Uint8Array<ArrayBuffer>]), "piece.chiffree");
      const res = await fetch("/api/coffre", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Envoi refusé");
      setItems((l) => [{ id: body.id, size: cipher.length, envelope, createdAt: new Date().toISOString(), author: "vous" }, ...l]);
      setNames((n) => ({ ...n, [body.id]: file.name }));
      setMessage(`${file.name} est chiffré et rangé dans le coffre.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  async function download(it: Item) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/coffre/${it.id}`);
      if (!res.ok) throw new Error("Pièce introuvable");
      const plain = await openFile(pass, it.envelope, new Uint8Array(await res.arrayBuffer()));
      if (!plain) throw new Error("Cette phrase secrète n'ouvre pas cette pièce.");
      const meta = await openName(pass, it.envelope);
      const url = URL.createObjectURL(new Blob([plain as Uint8Array<ArrayBuffer>], { type: meta?.type || "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = meta?.name || "piece";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ouverture impossible");
    } finally {
      setBusy(false);
    }
  }

  async function remove(it: Item) {
    setError("");
    const res = await fetch(`/api/coffre/${it.id}`, { method: "DELETE" });
    if (!res.ok) return setError("Suppression impossible");
    setItems((l) => l.filter((x) => x.id !== it.id));
  }

  if (!unlocked) {
    return (
      <form onSubmit={unlock} className="card space-y-3 p-4">
        <label className="block">
          <span className="label">Phrase secrète du coffre</span>
          <input
            type="password"
            className="input"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            aria-describedby="coffre-aide"
            data-testid="coffre-phrase"
          />
        </label>
        <p id="coffre-aide" className="text-xs text-muted">
          {items.length
            ? `${items.length} pièce${items.length > 1 ? "s" : ""} dans le coffre.`
            : "Coffre vide : la phrase choisie maintenant servira à ouvrir toutes les pièces."}{" "}
          12 caractères au moins, une courte phrase est plus sûre qu&apos;un mot.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button className="btn-primary" disabled={busy}>
          <Icon name="lock" size={16} /> Ouvrir le coffre
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <label className="btn-primary cursor-pointer">
            <Icon name="up" size={16} /> Ajouter une pièce
            <input type="file" className="sr-only" onChange={add} disabled={busy} data-testid="coffre-fichier" />
          </label>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setUnlocked(false);
            setPass("");
            setNames({});
          }}
        >
          Refermer le coffre
        </button>
        {busy ? <span className="text-sm text-muted">Chiffrement en cours...</span> : null}
      </div>
      <div aria-live="polite">
        {message ? <p className="text-sm text-success">{message}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {items.length ? (
        <ul className="card divide-y divide-line" data-testid="coffre-liste">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block font-medium break-words">{names[it.id] ?? "Pièce chiffrée avec une autre phrase"}</span>
                <span className="block text-xs text-muted">
                  {new Date(it.createdAt).toLocaleDateString("fr-FR")}, {ko(it.size)}
                  {it.author ? `, par ${it.author}` : ""}
                </span>
              </span>
              <span className="flex gap-2">
                {names[it.id] ? (
                  <button type="button" className="btn-secondary" onClick={() => download(it)} disabled={busy}>
                    Ouvrir
                  </button>
                ) : null}
                {canEdit ? (
                  <button type="button" className="link text-sm text-danger" onClick={() => remove(it)}>
                    Retirer
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune pièce pour l&apos;instant.</p>
      )}
    </div>
  );
}
