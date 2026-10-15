"use client";

import { importHomeRecordAction, importHomeRecordFileAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

/** Reprise d'un carnet transmis par le client : l'historique du logement suit le logement, d'un artisan à l'autre. */
export function ImportForm({ customers }: { customers: { id: string; name: string }[] }) {
  return (
    <ActionForm action={importHomeRecordAction} className="grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="hr-link">
          Lien de transmission reçu du client
        </label>
        <input id="hr-link" name="link" className="field" required placeholder="https://.../carnet/..." />
      </div>
      <div>
        <label className="label" htmlFor="hr-customer">
          Client concerné
        </label>
        <select id="hr-customer" name="customerId" className="field" required defaultValue="">
          <option value="" disabled>
            Choisir un client
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <Submit>Reprendre le carnet</Submit>
      </div>
    </ActionForm>
  );
}

/** Reprise d'un fichier de carnet (format ouvert), gardé par le propriétaire ou produit par un autre logiciel. */
export function ImportFileForm({ customers }: { customers: { id: string; name: string }[] }) {
  return (
    <ActionForm action={importHomeRecordFileAction} className="grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="hr-file">
          Fichier du carnet (carnet-logement.json)
        </label>
        <input id="hr-file" name="file" type="file" accept="application/json,.json" className="field" required />
      </div>
      <div>
        <label className="label" htmlFor="hr-file-customer">
          Client à qui rattacher le carnet
        </label>
        <select id="hr-file-customer" name="customerId" className="field" required defaultValue="">
          <option value="" disabled>
            Choisir un client
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <Submit>Reprendre le fichier</Submit>
      </div>
    </ActionForm>
  );
}
