"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { apiFetch, ApiError, uid } from "@/components/editor/api";
import { cancelQuoteAction } from "@/app/actions";

export function SendButton({ quoteId, primary }: { quoteId: string; primary: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const start = async () => {
    setOpen(true);
    setError("");
    setDone("");
    setKey(uid());
    try {
      setForm(await apiFetch(`/api/quotes/${quoteId}/send-template`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur");
    }
  };
  const send = async () => {
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      // La clé d'idempotence évite un double envoi en cas de double clic ou de réseau instable.
      const r = await apiFetch<{ status: string; error?: string }>(`/api/quotes/${quoteId}/send`, {
        method: "POST",
        json: form,
        headers: { "idempotency-key": key },
      });
      if (r.status === "sent") {
        setDone(`Devis envoyé à ${form.to}.`);
        router.refresh();
      } else setError(`L'envoi a échoué : ${r.error ?? "adresse refusée"}. Vérifiez l'adresse puis réessayez.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={primary ? "btn-primary" : "btn-secondary"} onClick={start}>
        <Icon name="send" size={16} /> Envoyer par e-mail
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Envoyer le devis" wide>
        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-success">
              <Icon name="check" /> {done}
            </p>
            <p className="text-sm text-muted">Le client reçoit un lien sécurisé pour consulter, télécharger et accepter le devis en ligne.</p>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        ) : form ? (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="s-to">
                Destinataire
              </label>
              <input id="s-to" type="email" className="field" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="s-subject">
                Objet
              </label>
              <input id="s-subject" className="field" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="s-body">
                Message
              </label>
              <textarea id="s-body" rows={9} className="field" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              <p className="mt-1 text-xs text-muted">{"{lien}"} est remplacé par le lien de consultation sécurisé. Le PDF est joint.</p>
            </div>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button type="button" className="btn-primary" onClick={send} disabled={busy || !form.to}>
                {busy ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <p className="text-sm text-muted">Préparation du message...</p>
        )}
      </Modal>
    </>
  );
}

export function ShareLinkButton({ quoteId }: { quoteId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const create = async () => {
    setError("");
    try {
      const r = await apiFetch<{ url: string }>(`/api/quotes/${quoteId}/share-link`, { method: "POST" });
      setUrl(r.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur");
    }
  };
  return (
    <div>
      {url ? (
        <div className="flex gap-2">
          <input readOnly value={url} className="field-sm flex-1 text-xs" onFocus={(e) => e.target.select()} aria-label="Lien de consultation" />
          <button
            type="button"
            className="btn-secondary min-h-8 text-sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(url).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      ) : (
        <button type="button" className="btn-secondary w-full" onClick={create}>
          <Icon name="link" size={16} /> Créer un lien de consultation
        </button>
      )}
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function ManualResponse({ quoteId, version }: { quoteId: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState<"accept" | "refuse" | null>(null);
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/quotes/${quoteId}/accept`, { method: "POST", json: { decision: open, version, proof } });
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={() => setOpen("accept")}>
          <Icon name="check" size={16} className="text-success" /> Accepté
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={() => setOpen("refuse")}>
          <Icon name="x" size={16} className="text-danger" /> Refusé
        </button>
      </div>
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open === "accept" ? "Enregistrer l'acceptation" : "Enregistrer le refus"}>
        <div className="space-y-4 text-sm">
          <p>
            {open === "accept"
              ? `Le client a accepté la version ${version} en dehors du lien en ligne (devis signé, accord écrit). Indiquez la preuve dont vous disposez.`
              : "Indiquez comment le client vous a fait part de son refus."}
          </p>
          <textarea
            rows={3}
            className="field"
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder={open === "accept" ? "Ex. : devis signé avec la mention « bon pour accord », reçu par courrier le 12/10" : "Ex. : appel téléphonique du 12/10"}
            aria-label="Preuve"
          />
          {error ? <p className="text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(null)}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={busy || proof.trim().length < 3}>
              Enregistrer
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CancelQuote({ quoteId, accepted }: { quoteId: string; accepted: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelQuoteAction, null);
  return (
    <>
      <button type="button" className="btn-ghost w-full justify-start text-sm text-danger" onClick={() => setOpen(true)}>
        <Icon name="x" size={16} /> Annuler le devis
      </button>
      <Modal open={open && !state?.ok} onClose={() => setOpen(false)} title="Annuler le devis">
        <form action={action} className="space-y-4 text-sm">
          <input type="hidden" name="id" value={quoteId} />
          <p>
            Le devis reste conservé avec toutes ses versions, mais le client ne pourra plus l'accepter. Les liens de consultation sont
            désactivés.
          </p>
          <div>
            <label className="label" htmlFor="c-reason">
              Motif {accepted ? "(obligatoire pour un devis accepté)" : "(facultatif)"}
            </label>
            <textarea id="c-reason" name="reason" rows={2} className="field" required={accepted} />
          </div>
          {state?.error ? <p className="text-danger">{state.error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Retour
            </button>
            <button className="btn-danger" disabled={pending}>
              Annuler le devis
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function IntegrityCheck({ quoteId, version }: { quoteId: string; version: number }) {
  const [r, setR] = useState<{ pdfOk: boolean; snapshotOk: boolean; reason: string | null } | null>(null);
  return r ? (
    <p className={`text-xs ${r.pdfOk && r.snapshotOk ? "text-success" : "text-danger"}`}>
      {r.pdfOk && r.snapshotOk ? "Intégrité vérifiée : PDF et données conformes à l'émission." : `Anomalie détectée : ${r.reason ?? "empreinte du PDF différente"}`}
    </p>
  ) : (
    <button type="button" className="link text-xs" onClick={async () => setR(await apiFetch(`/api/quotes/${quoteId}/verify?version=${version}`))}>
      Vérifier l'intégrité
    </button>
  );
}
