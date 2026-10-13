"use client";

import {
  createOrderAction,
  deleteOrderLineAction,
  orderStatusAction,
  prepareOrdersAction,
  receiveOrderAction,
  saveOrderLineAction,
  supplierInvoiceAction,
  updateOrderAction,
} from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

/** Commandes préparées depuis le devis signé, ou commande vide. */
export function PrepareOrders({ jobId, hasQuote }: { jobId: string; hasQuote: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {hasQuote ? (
        <ActionForm action={prepareOrdersAction} className="">
          <input type="hidden" name="jobId" value={jobId} />
          <Submit className="btn-primary" pendingLabel="Préparation...">
            <Icon name="wand" size={16} /> Préparer les commandes depuis le devis
          </Submit>
        </ActionForm>
      ) : null}
      <ActionForm action={createOrderAction} className="">
        <input type="hidden" name="jobId" value={jobId} />
        <Submit className="btn-secondary" pendingLabel="Création...">
          <Icon name="plus" size={16} /> Commande vide
        </Submit>
      </ActionForm>
    </div>
  );
}

type Ids = { jobId: string; orderId: string };

function Hidden({ jobId, orderId }: Ids) {
  return (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="orderId" value={orderId} />
    </>
  );
}

export function OrderInfoForm({
  ids,
  order,
}: {
  ids: Ids;
  order: { supplier: string; supplier_email: string; delivery_date: string | null; delivery_address: string; notes: string };
}) {
  return (
    <ActionForm action={updateOrderAction} className="grid gap-3 sm:grid-cols-2">
      <Hidden {...ids} />
      <div>
        <label className="label" htmlFor="po-supplier">
          Fournisseur
        </label>
        <input id="po-supplier" name="supplier" className="field" maxLength={120} defaultValue={order.supplier} required />
      </div>
      <div>
        <label className="label" htmlFor="po-email">
          E-mail du fournisseur
        </label>
        <input id="po-email" name="supplierEmail" type="email" className="field" maxLength={200} defaultValue={order.supplier_email} />
      </div>
      <div>
        <label className="label" htmlFor="po-date">
          Livraison souhaitée le
        </label>
        <input id="po-date" name="deliveryDate" type="date" className="field" defaultValue={order.delivery_date ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="po-address">
          Adresse de livraison
        </label>
        <input id="po-address" name="deliveryAddress" className="field" maxLength={300} defaultValue={order.delivery_address} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="po-notes">
          Remarques pour le fournisseur
        </label>
        <textarea id="po-notes" name="notes" className="field min-h-20" maxLength={2000} defaultValue={order.notes} />
      </div>
      <div className="sm:col-span-2">
        <Submit className="btn-secondary" pendingLabel="Enregistrement...">
          Enregistrer
        </Submit>
      </div>
    </ActionForm>
  );
}

/** Ajout ou modification d'une ligne du brouillon. */
export function OrderLineForm({
  ids,
  line,
}: {
  ids: Ids;
  line?: { id: string; label: string; reference: string; unit: string; quantity: string; unit_cost_cents: number };
}) {
  const p = line ? `ol-${line.id}` : "ol-new";
  return (
    <ActionForm action={saveOrderLineAction} resetOnSuccess={!line} className="grid gap-2 sm:grid-cols-[1fr_6rem_5rem_5rem_7rem_auto] sm:items-end">
      <Hidden {...ids} />
      {line ? <input type="hidden" name="lineId" value={line.id} /> : null}
      <div>
        <label className="label" htmlFor={`${p}-label`}>
          Désignation
        </label>
        <input id={`${p}-label`} name="label" className="field" maxLength={300} defaultValue={line?.label} required />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-ref`}>
          Réf.
        </label>
        <input id={`${p}-ref`} name="reference" className="field" maxLength={60} defaultValue={line?.reference} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-qty`}>
          Qté
        </label>
        <input id={`${p}-qty`} name="quantity" className="field" inputMode="decimal" defaultValue={line?.quantity.replace(".", ",")} required />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-unit`}>
          Unité
        </label>
        <input id={`${p}-unit`} name="unit" className="field" maxLength={20} defaultValue={line?.unit ?? "u"} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-cost`}>
          Prix unit. HT
        </label>
        <input
          id={`${p}-cost`}
          name="unitCost"
          className="field"
          inputMode="decimal"
          defaultValue={line && line.unit_cost_cents ? (line.unit_cost_cents / 100).toFixed(2).replace(".", ",") : ""}
        />
      </div>
      <Submit className="btn-secondary" pendingLabel="...">
        {line ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />}
        <span className={line ? "sr-only" : ""}>{line ? `Enregistrer ${line.label}` : "Ajouter"}</span>
      </Submit>
    </ActionForm>
  );
}

export function DeleteOrderLine({ ids, lineId, label }: { ids: Ids; lineId: string; label: string }) {
  return (
    <ActionForm action={deleteOrderLineAction} className="">
      <Hidden {...ids} />
      <input type="hidden" name="lineId" value={lineId} />
      <button className="btn-ghost min-h-8 px-2 text-danger" aria-label={`Supprimer ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

export function OrderStatusButtons({ ids, canSend, canCancel }: { ids: Ids; canSend: boolean; canCancel: boolean }) {
  return (
    <ActionForm action={orderStatusAction} className="flex flex-wrap gap-2">
      <Hidden {...ids} />
      {canSend ? (
        <button name="decision" value="envoyer" className="btn-primary">
          <Icon name="send" size={16} /> Marquer comme envoyée
        </button>
      ) : null}
      {canCancel ? (
        <button name="decision" value="annuler" className="btn-ghost text-danger">
          Annuler la commande
        </button>
      ) : null}
    </ActionForm>
  );
}

/** Réception : quantité reçue au total pour chaque ligne. */
export function ReceiveForm({ ids, lines }: { ids: Ids; lines: { id: string; label: string; unit: string; quantity: string; received: string }[] }) {
  return (
    <ActionForm action={receiveOrderAction} className="space-y-3">
      <Hidden {...ids} />
      <ul className="divide-y divide-line text-sm">
        {lines.map((l) => (
          <li key={l.id} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_9rem]">
            <label htmlFor={`recu-${l.id}`}>
              {l.label}
              <span className="block text-xs text-muted">
                Commandé : {l.quantity.replace(".", ",")} {l.unit}
              </span>
            </label>
            <input
              id={`recu-${l.id}`}
              name={`recu_${l.id}`}
              className="field"
              inputMode="decimal"
              defaultValue={l.received === "0" ? "" : l.received.replace(".", ",")}
              placeholder="0"
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Submit className="btn-primary" pendingLabel="Enregistrement...">
          <Icon name="truck" size={16} /> Enregistrer la réception
        </Submit>
      </div>
    </ActionForm>
  );
}

export function SupplierInvoiceForm({ ids, today }: { ids: Ids; today: string }) {
  return (
    <ActionForm action={supplierInvoiceAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
      <Hidden {...ids} />
      <div>
        <label className="label" htmlFor="si-amount">
          Montant HT (euros)
        </label>
        <input id="si-amount" name="amount" className="field" inputMode="decimal" placeholder="360,80" required />
      </div>
      <div>
        <label className="label" htmlFor="si-date">
          Date de la facture
        </label>
        <input id="si-date" name="date" type="date" className="field" defaultValue={today} max={today} required />
      </div>
      <div>
        <label className="label" htmlFor="si-ref">
          Numéro de facture
        </label>
        <input id="si-ref" name="reference" className="field" maxLength={80} />
      </div>
      <div className="sm:col-span-3">
        <Submit className="btn-secondary" pendingLabel="Enregistrement...">
          <Icon name="euro" size={16} /> Rapprocher la facture
        </Submit>
      </div>
    </ActionForm>
  );
}
