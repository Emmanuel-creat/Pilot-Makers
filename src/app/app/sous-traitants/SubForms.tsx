"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  addJobSubcontractorAction,
  archiveSubcontractorAction,
  createSubcontractorAction,
  deleteSubDocumentAction,
  removeJobSubcontractorAction,
  requestSubDocumentsAction,
  updateSubcontractorAction,
} from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

type Sub = {
  id: string;
  name: string;
  siret: string;
  trade: string;
  contact_name: string;
  email: string;
  phone: string;
  notes: string;
  auto_remind: boolean;
};

/** Fiche du sous-traitant : création ou modification. */
export function SubcontractorForm({ sub }: { sub?: Sub }) {
  const p = sub ? "st-edit" : "st-new";
  return (
    <ActionForm action={sub ? updateSubcontractorAction : createSubcontractorAction} className="grid gap-3 sm:grid-cols-2">
      {sub ? <input type="hidden" name="id" value={sub.id} /> : null}
      <div>
        <label className="label" htmlFor={`${p}-name`}>
          Raison sociale
        </label>
        <input id={`${p}-name`} name="name" className="field" maxLength={160} defaultValue={sub?.name} required />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-trade`}>
          Métier
        </label>
        <input id={`${p}-trade`} name="trade" className="field" maxLength={80} defaultValue={sub?.trade} placeholder="Électricité, plâtrerie..." />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-siret`}>
          SIRET
        </label>
        <input id={`${p}-siret`} name="siret" className="field" inputMode="numeric" maxLength={30} defaultValue={sub?.siret} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-contact`}>
          Interlocuteur
        </label>
        <input id={`${p}-contact`} name="contactName" className="field" maxLength={120} defaultValue={sub?.contact_name} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-email`}>
          E-mail
        </label>
        <input id={`${p}-email`} name="email" type="email" className="field" maxLength={200} defaultValue={sub?.email} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-phone`}>
          Téléphone
        </label>
        <input id={`${p}-phone`} name="phone" type="tel" className="field" maxLength={40} defaultValue={sub?.phone} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}-notes`}>
          Notes
        </label>
        <textarea id={`${p}-notes`} name="notes" className="field min-h-16" maxLength={2000} defaultValue={sub?.notes} />
      </div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="autoRemind" className="mt-0.5 h-4 w-4" defaultChecked={sub?.auto_remind} />
        <span>
          Relancer automatiquement par e-mail
          <span className="block text-xs text-muted">Une fois par semaine au plus, quand un document exigé expire dans 15 jours ou a expiré.</span>
        </span>
      </label>
      <div className="sm:col-span-2">
        <Submit className={sub ? "btn-secondary" : "btn-primary"} pendingLabel="Enregistrement...">
          {sub ? "Enregistrer" : "Ajouter le sous-traitant"}
        </Submit>
      </div>
    </ActionForm>
  );
}

/** Envoi d'un document : fichier PDF ou photo, avec sa date de fin de validité. */
export function DocumentUpload({ subId, kinds }: { subId: string; kinds: Record<string, string> }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
          const res = await fetch(`/api/subcontractors/${subId}/documents`, { method: "POST", body: new FormData(e.currentTarget) });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Envoi impossible");
          form.current?.reset();
          setDone(true);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="doc-kind">
          Document
        </label>
        <select id="doc-kind" name="kind" className="field">
          {Object.entries(kinds).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="doc-until">
          Valable jusqu'au
        </label>
        <input id="doc-until" name="validUntil" type="date" className="field" aria-describedby="doc-until-help" />
        <p id="doc-until-help" className="mt-1 text-xs text-muted">
          Laissé vide pour l'attestation URSSAF : six mois à partir d'aujourd'hui.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="doc-file">
          Fichier (PDF, JPEG ou PNG, 5 Mo au plus)
        </label>
        <input id="doc-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="doc-label">
          Précision
        </label>
        <input id="doc-label" name="label" className="field" maxLength={160} placeholder="Assureur, numéro de police..." />
      </div>
      <div className="sm:col-span-2">
        <button className="btn-secondary" disabled={busy}>
          <Icon name="upload" size={16} /> {busy ? "Envoi..." : "Ajouter le document"}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : done ? (
          <p role="status" className="mt-2 text-sm text-success">
            Document ajouté.
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteSubDocument({ docId, label }: { docId: string; label: string }) {
  return (
    <ActionForm action={deleteSubDocumentAction} className="">
      <input type="hidden" name="docId" value={docId} />
      <button className="btn-ghost min-h-8 px-2 text-danger" aria-label={`Supprimer ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

export function RequestDocuments({ id }: { id: string }) {
  return (
    <ActionForm action={requestSubDocumentsAction} className="">
      <input type="hidden" name="id" value={id} />
      <Submit className="btn-secondary" pendingLabel="Envoi...">
        <Icon name="send" size={16} /> Demander les documents à jour
      </Submit>
    </ActionForm>
  );
}

export function ArchiveSubcontractor({ id, archived }: { id: string; archived: boolean }) {
  return (
    <ActionForm action={archiveSubcontractorAction} className="">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <Submit className="btn-ghost" pendingLabel="...">
        <Icon name="archive" size={16} /> {archived ? "Réactiver" : "Archiver"}
      </Submit>
    </ActionForm>
  );
}

/** Ajout d'un sous-traitant sur un chantier, avec le montant du marché. */
export function JobSubcontractorForm({ jobId, subs }: { jobId: string; subs: { id: string; name: string }[] }) {
  return (
    <ActionForm action={addJobSubcontractorAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end">
      <input type="hidden" name="jobId" value={jobId} />
      <div>
        <label className="label" htmlFor="js-sub">
          Sous-traitant
        </label>
        <select id="js-sub" name="subcontractorId" className="field">
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="js-scope">
          Travaux confiés
        </label>
        <input id="js-scope" name="scope" className="field" maxLength={200} />
      </div>
      <div>
        <label className="label" htmlFor="js-amount">
          Montant HT
        </label>
        <input id="js-amount" name="amount" className="field" inputMode="decimal" placeholder="6 200" />
      </div>
      <Submit className="btn-secondary" pendingLabel="...">
        <Icon name="plus" size={16} /> Ajouter au chantier
      </Submit>
    </ActionForm>
  );
}

export function RemoveJobSubcontractor({ jobId, subId, name }: { jobId: string; subId: string; name: string }) {
  return (
    <ActionForm action={removeJobSubcontractorAction} className="">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="subcontractorId" value={subId} />
      <button className="btn-ghost min-h-8 px-2 text-danger" aria-label={`Retirer ${name} du chantier`}>
        <Icon name="x" size={16} />
      </button>
    </ActionForm>
  );
}
