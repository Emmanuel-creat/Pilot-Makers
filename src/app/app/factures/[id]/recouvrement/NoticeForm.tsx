"use client";

import { formalNoticeAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function NoticeForm({ invoiceId, today, min }: { invoiceId: string; today: string; min: string }) {
  return (
    <ActionForm action={formalNoticeAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="notice-date">
            Date d&apos;envoi
          </label>
          <input id="notice-date" name="date" type="date" className="field" defaultValue={today} min={min} max={today} required />
        </div>
        <div>
          <label className="label" htmlFor="notice-ref">
            Numéro du recommandé (facultatif)
          </label>
          <input id="notice-ref" name="ref" className="field" maxLength={60} placeholder="Ex. : 1A 234 567 8901 2" />
        </div>
      </div>
      <Submit>Enregistrer l&apos;envoi</Submit>
    </ActionForm>
  );
}

export function ClearNotice({ invoiceId }: { invoiceId: string }) {
  return (
    <ActionForm action={formalNoticeAction}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="op" value="clear" />
      <button className="link text-xs text-danger">Effacer cet envoi</button>
    </ActionForm>
  );
}
