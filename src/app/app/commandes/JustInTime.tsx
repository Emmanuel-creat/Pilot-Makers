"use client";

import Link from "next/link";
import { useActionState } from "react";
import { alignDeliveryAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import type { DeliveryState } from "@/lib/just-in-time";

interface Row {
  id: string;
  number: string;
  supplier: string;
  jobId: string;
  jobTitle: string;
  deliveryDate: string | null;
  workStart: string | null;
  advice: { state: DeliveryState; ideal: string | null; message: string };
}

const fr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "non fixée");

function Align({ id, ideal }: { id: string; ideal: string }) {
  const [state, run] = useActionState(alignDeliveryAction, null);
  return (
    <form action={run} className="text-right">
      <input type="hidden" name="id" value={id} />
      <button className="btn-secondary min-h-8 text-sm">Caler au {fr(ideal)}</button>
      {state?.error ? <p className="text-xs text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-xs text-success">{state.message}</p> : null}
    </form>
  );
}

/** Commandes dont la livraison n'est pas calée sur le premier jour de travaux du chantier. */
export function JustInTime({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const off = rows.filter((r) => r.advice.state !== "ok");
  if (!rows.length) return null;
  return (
    <section className="card p-4" aria-labelledby="juste-a-temps" data-testid="juste-a-temps">
      <h2 id="juste-a-temps" className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="truck" size={18} /> Livraisons juste à temps
      </h2>
      <p className="text-sm text-muted">
        {off.length
          ? `${off.length} commande${off.length > 1 ? "s" : ""} sur ${rows.length} à caler sur le planning : livraison la veille du début des travaux.`
          : `Les ${rows.length} commandes en cours arrivent la veille des travaux.`}
      </p>
      {off.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {off.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <span className="min-w-0">
                <Link href={`/app/commandes/${r.id}`} className="link font-medium">
                  {r.number}
                </Link>{" "}
                {r.supplier ? `chez ${r.supplier}, ` : ""}
                {r.jobTitle}
                <span className="block text-xs text-muted">
                  Travaux le {fr(r.workStart)}, livraison {fr(r.deliveryDate)}
                </span>
                <span className={`block text-xs ${r.advice.state === "trop_tard" ? "text-danger" : "text-warning"}`}>{r.advice.message}</span>
              </span>
              {canEdit && r.advice.ideal ? <Align id={r.id} ideal={r.advice.ideal} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
