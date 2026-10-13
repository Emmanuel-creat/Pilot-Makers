"use client";

import { useActionState, useRef, useState } from "react";
import { jobPositionAction, locateJobAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

/** Emplacement du chantier : depuis l'adresse, ou position relevée sur place avec le téléphone. */
export function JobLocation({
  jobId,
  located,
  source,
  label,
  canEdit,
}: {
  jobId: string;
  located: boolean;
  source: string;
  label: string;
  canEdit: boolean;
}) {
  const [geo, locate] = useActionState(locateJobAction, null);
  const [pos, savePos] = useActionState(jobPositionAction, null);
  const form = useRef<HTMLFormElement>(null);
  const [gpsError, setGpsError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2">
        <Icon name="pin" size={16} className={located ? "text-success" : "text-muted"} />
        {located
          ? source === "gps"
            ? "Position relevée sur place."
            : `Localisé d'après l'adresse${label ? ` (${label})` : ""}.`
          : "Pas encore localisé : les temps de trajet ne peuvent pas être estimés."}
      </p>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <form action={locate}>
            <input type="hidden" name="jobId" value={jobId} />
            <Submit className="btn-secondary min-h-9" pendingLabel="Recherche...">
              Localiser l'adresse
            </Submit>
          </form>
          <form action={savePos} ref={form}>
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="latitude" />
            <input type="hidden" name="longitude" />
            <button
              type="button"
              className="btn-ghost min-h-9"
              disabled={busy}
              onClick={() => {
                setGpsError("");
                if (!navigator.geolocation) return setGpsError("Cet appareil ne donne pas sa position.");
                setBusy(true);
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    const f = form.current!;
                    (f.elements.namedItem("latitude") as HTMLInputElement).value = String(p.coords.latitude);
                    (f.elements.namedItem("longitude") as HTMLInputElement).value = String(p.coords.longitude);
                    setBusy(false);
                    f.requestSubmit();
                  },
                  () => {
                    setBusy(false);
                    setGpsError("Position refusée ou indisponible. Autorisez la localisation puis réessayez.");
                  },
                  { enableHighAccuracy: true, timeout: 15000 },
                );
              }}
            >
              <Icon name="pin" size={16} /> {busy ? "Localisation..." : "Je suis sur le chantier"}
            </button>
          </form>
        </div>
      ) : null}
      {gpsError ? (
        <p role="alert" className="text-danger">
          {gpsError}
        </p>
      ) : null}
      <FormMessage state={geo} />
      <FormMessage state={pos} />
    </div>
  );
}
