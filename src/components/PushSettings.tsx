"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/components/editor/api";
import { Icon } from "./Icon";

export interface PushDevice {
  id: string;
  device: string;
  createdAt: string;
  lastSuccessAt: string | null;
}

const toBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js");
}

/** Activation des notifications sur l'appareil, liste des appareils et notification d'essai. */
export function PushSettings({ devices }: { devices: PushDevice[] }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await task() });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "L'appareil a refusé les notifications." });
    } finally {
      setBusy(false);
    }
  }

  const enable = () =>
    run(async () => {
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        throw new Error("refus");
      }
      const { publicKey } = await apiFetch<{ publicKey: string }>("/api/account/push");
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
      await apiFetch("/api/account/push", { method: "POST", json: sub.toJSON() });
      setState("on");
      return "Notifications activées sur cet appareil.";
    });

  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await apiFetch("/api/account/push", { method: "DELETE", json: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
      return "Notifications coupées sur cet appareil.";
    });

  const test = () =>
    run(async () => {
      await apiFetch("/api/account/push/test", { method: "POST" });
      return "Notification d'essai envoyée : elle arrive dans la minute.";
    });

  const remove = (id: string) =>
    run(async () => {
      await apiFetch(`/api/account/push/${id}`, { method: "DELETE" });
      return "Appareil retiré.";
    });

  return (
    <div className="space-y-4">
      {state === "unsupported" ? (
        <p className="text-sm text-muted">
          Ce navigateur ne reçoit pas de notifications. Sur iPhone, ajoutez d'abord Pilot-Makers à l'écran d'accueil depuis le bouton Partager de Safari.
        </p>
      ) : state === "denied" ? (
        <p className="text-sm text-muted">Les notifications sont bloquées pour ce site dans les réglages du navigateur.</p>
      ) : state === "loading" ? null : (
        <div className="flex flex-wrap gap-2">
          {state === "off" ? (
            <button type="button" className="btn-primary" onClick={enable} disabled={busy}>
              <Icon name="bell" />
              Activer sur cet appareil
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={disable} disabled={busy}>
              Couper sur cet appareil
            </button>
          )}
        </div>
      )}
      {devices.length ? (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{d.device}</span>
                <span className="block text-xs text-muted">
                  Activé le {day(d.createdAt)}
                  {d.lastSuccessAt ? `, dernière notification le ${day(d.lastSuccessAt)}` : ""}
                </span>
              </span>
              <button type="button" className="btn-secondary" onClick={() => remove(d.id)} aria-label={`Retirer l'appareil ${d.device}`}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {devices.length ? (
        <button type="button" className="btn-secondary" onClick={test} disabled={busy}>
          Envoyer une notification d'essai
        </button>
      ) : null}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
