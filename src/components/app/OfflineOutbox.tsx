"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OFFLINE_OUTBOX, readOutbox } from "@/lib/offline-quote";

/**
 * Envoie au serveur les devis préparés sans réseau dès que l'application est ouverte avec une connexion,
 * puis les retire de la file du téléphone. Un envoi interrompu reprend sans doublon.
 */
export function OfflineOutbox() {
  const [created, setCreated] = useState<{ id: string; title: string }[]>([]);
  const [failed, setFailed] = useState(0);

  const flush = useCallback(async () => {
    let pending;
    try {
      pending = readOutbox(localStorage.getItem(OFFLINE_OUTBOX));
    } catch {
      return;
    }
    if (!pending.length || !navigator.onLine) return;
    const done: { id: string; title: string }[] = [];
    let errors = 0;
    for (const q of pending) {
      try {
        const res = await fetch("/api/devis-hors-ligne", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q) });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { id: string };
        done.push({ id: body.id, title: q.title });
        const rest = readOutbox(localStorage.getItem(OFFLINE_OUTBOX)).filter((x) => x.key !== q.key);
        localStorage.setItem(OFFLINE_OUTBOX, JSON.stringify(rest));
      } catch {
        errors++;
      }
    }
    if (done.length) setCreated((c) => [...c, ...done]);
    setFailed(errors);
  }, []);

  useEffect(() => {
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  if (!created.length && !failed) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md rounded-lg border border-line bg-surface p-4 text-sm shadow-lg md:bottom-6"
      data-testid="devis-hors-ligne-envoyes"
    >
      {created.length ? (
        <>
          <p className="font-medium">
            {created.length} devis préparé{created.length > 1 ? "s" : ""} sans réseau {created.length > 1 ? "sont" : "est"} maintenant dans l&apos;application :
          </p>
          <ul className="mt-1 list-disc pl-5">
            {created.map((c) => (
              <li key={c.id}>
                <Link href={`/app/devis/${c.id}`} className="link">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {failed ? <p className="mt-1 text-danger">{failed} envoi(s) en attente : nouvel essai au prochain retour du réseau.</p> : null}
      <button type="button" className="link mt-2 text-xs" onClick={() => (setCreated([]), setFailed(0))}>
        Fermer
      </button>
    </div>
  );
}
