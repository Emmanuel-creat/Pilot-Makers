"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiFetch } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

/** Dépôt d'un relevé bancaire, avec le bilan de l'import. */
export function BankImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <label className="label" htmlFor="bank-file">
        Relevé bancaire (OFX, CAMT.053, CSV, Excel ou LibreOffice)
      </label>
      <input
        id="bank-file"
        type="file"
        className="field"
        accept=".ofx,.qfx,.xml,.csv,.txt,.xlsx,.ods"
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setMessage(null);
          try {
            const body = new FormData();
            body.set("file", f);
            const r = await apiFetch<{ read: number; added: number; duplicates: number; matched: number }>("/api/bank/import", { method: "POST", body });
            setMessage({
              ok: true,
              text: `${r.added} opération(s) ajoutée(s)${r.duplicates ? `, ${r.duplicates} déjà importée(s)` : ""}, ${r.matched} rapprochée(s) automatiquement.`,
            });
            router.refresh();
          } catch (err) {
            setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Import impossible" });
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      {busy ? (
        <p className="flex items-center gap-1 text-sm text-muted">
          <Icon name="refresh" size={14} /> Lecture du relevé...
        </p>
      ) : null}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
