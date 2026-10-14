"use client";

import { markLeaveDeclarationSentAction, saveLeaveDeclarationAction, saveLeaveFundAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function LeaveFundForm({ fundName, memberNumber, rate }: { fundName: string; memberNumber: string; rate: string }) {
  return (
    <ActionForm action={saveLeaveFundAction} className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="lf-name">
          Caisse de congés payés
        </label>
        <input id="lf-name" name="fundName" className="field" maxLength={120} defaultValue={fundName} placeholder="Ex. : CIBTP de votre région" />
      </div>
      <div>
        <label className="label" htmlFor="lf-number">
          N° d&apos;adhérent
        </label>
        <input id="lf-number" name="memberNumber" className="field" maxLength={40} defaultValue={memberNumber} />
      </div>
      <div>
        <label className="label" htmlFor="lf-rate">
          Taux de cotisation (%)
        </label>
        <input id="lf-rate" name="rate" className="field" inputMode="decimal" defaultValue={rate} required />
      </div>
      <div className="sm:col-span-4">
        <Submit className="btn-secondary">Enregistrer la caisse</Submit>
      </div>
    </ActionForm>
  );
}

export function DeclarationForm({
  period,
  lines,
  locked,
  children,
}: {
  period: string;
  lines: { userId: string; name: string; gross: string }[];
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <ActionForm action={saveLeaveDeclarationAction} className="space-y-3">
      <input type="hidden" name="period" value={period} />
      {children}
      {!locked ? (
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium">Salaires bruts du mois</legend>
          {lines.map((l) => (
            <div key={l.userId}>
              <label className="label" htmlFor={`brut-${l.userId}`}>
                {l.name} (euros)
              </label>
              <input id={`brut-${l.userId}`} name={`brut_${l.userId}`} className="field" inputMode="decimal" defaultValue={l.gross} required />
            </div>
          ))}
        </fieldset>
      ) : null}
      {!locked && lines.length ? <Submit className="btn-primary">Enregistrer la déclaration</Submit> : null}
    </ActionForm>
  );
}

export function MarkSent({ period }: { period: string }) {
  return (
    <ActionForm action={markLeaveDeclarationSentAction} className="inline">
      <input type="hidden" name="period" value={period} />
      <Submit className="btn-secondary">Marquer comme transmise</Submit>
    </ActionForm>
  );
}
