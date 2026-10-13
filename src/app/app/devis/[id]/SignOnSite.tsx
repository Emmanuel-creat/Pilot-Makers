"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { SignaturePad } from "@/components/SignaturePad";
import { apiFetch, ApiError } from "@/components/editor/api";
import { formatEuros } from "@/lib/calc/format";

/** Le client signe sur la tablette ou le téléphone de l'artisan ; il reçoit son exemplaire signé par e-mail. */
export function SignOnSite({
  quoteId,
  number,
  version,
  baseTtcCents,
  customerName,
  options = [],
  vatAttestation = "",
  withdrawal = false,
}: {
  quoteId: string;
  number: string;
  version: number;
  baseTtcCents: number;
  customerName: string;
  options?: { id: string; label: string; ttcCents: number }[];
  vatAttestation?: string;
  withdrawal?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customerName);
  const [chosen, setChosen] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [attest, setAttest] = useState(false);
  const [earlyStart, setEarlyStart] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ emailed: boolean } | null>(null);
  const total = baseTtcCents + options.filter((o) => chosen.includes(o.id)).reduce((s, o) => s + o.ttcCents, 0);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ emailed: boolean }>(`/api/quotes/${quoteId}/sign-onsite`, {
        method: "POST",
        json: { version, name, consent, vatAttestation: attest, earlyStart, options: chosen, signature },
      });
      setDone(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setOpen(false);
    if (done) router.refresh();
  };

  return (
    <>
      <button type="button" className="btn-primary w-full text-sm" onClick={() => setOpen(true)}>
        <Icon name="edit" size={16} /> Faire signer sur place
      </button>
      <Modal open={open} onClose={close} title={`Signature du devis ${number}`} wide>
        {done ? (
          <div className="space-y-4 text-sm">
            <p className="flex items-center gap-2 text-success">
              <Icon name="check" /> Devis signé et accepté.
            </p>
            <p className="text-muted">
              {done.emailed
                ? "Le client reçoit par e-mail le lien vers son exemplaire signé."
                : "Le client n'a pas d'adresse e-mail : remettez-lui l'exemplaire accepté (bouton « Exemplaire accepté » de la page du devis)."}
            </p>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={close}>
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted">Tendez l'écran au client : il relit le montant, coche son accord et signe au doigt ou au stylet.</p>
            {options.length ? (
              <fieldset className="space-y-1.5">
                <legend className="label">Options retenues</legend>
                {options.map((o) => (
                  <label key={o.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={chosen.includes(o.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.id] : c.filter((x) => x !== o.id)))}
                    />
                    <span className="flex-1">{o.label}</span>
                    <span className="tabular shrink-0">+ {formatEuros(o.ttcCents)} TTC</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div>
              <label className="label" htmlFor="sos-name">
                Nom et prénom du signataire
              </label>
              <input id="sos-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </div>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                Bon pour accord : j'accepte le devis {number} (version {version}) d'un montant de{" "}
                <strong className="tabular">{formatEuros(total)} TTC</strong>
                {options.length ? (chosen.length ? ", options cochées comprises" : ", sans option") : ""}, ainsi que ses conditions.
              </span>
            </label>
            {vatAttestation ? (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                <span>
                  <strong>J'atteste les conditions du taux réduit de TVA :</strong> {vatAttestation}
                </span>
              </label>
            ) : null}
            {withdrawal ? (
              <div className="space-y-2 rounded-md bg-surface-2 p-3">
                <p>
                  Vous disposez de 14 jours après votre signature pour vous rétracter, sans justification, avec le formulaire joint au devis ou par
                  tout écrit. Aucun paiement ne peut vous être demandé avant 7 jours.
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={earlyStart} onChange={(e) => setEarlyStart(e.target.checked)} />
                  <span>Je demande que les travaux commencent avant la fin du délai de rétractation (facultatif).</span>
                </label>
              </div>
            ) : null}
            <SignaturePad name="signature" label="Signature du client" onChange={setSignature} />
            {error ? (
              <p role="alert" className="flex items-center gap-2 text-danger">
                <Icon name="alert" size={16} /> {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={close}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !consent || !signature || name.trim().length < 2 || (Boolean(vatAttestation) && !attest)}
                onClick={submit}
              >
                <Icon name="check" size={16} /> Valider la signature
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
