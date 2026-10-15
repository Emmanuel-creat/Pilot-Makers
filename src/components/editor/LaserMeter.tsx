"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatMeters, LASER_PROFILES, profileForService } from "@/lib/laser-meter";

/* Types minimaux de Web Bluetooth (absent des types du navigateur fournis par TypeScript). */
interface Characteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<Characteristic>;
  writeValue(data: BufferSource): Promise<void>;
}
interface Device extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryServices(): Promise<{ uuid: string; getCharacteristic(uuid: string): Promise<Characteristic> }[]>;
    }>;
    disconnect(): void;
  };
}
type Bluetooth = { requestDevice(o: unknown): Promise<Device> };
const bluetooth = () => (typeof navigator !== "undefined" ? (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth : undefined);

/** Bouton de connexion d'un télémètre laser : chaque mesure prise sur l'appareil est transmise en mètres. */
export function LaserMeter({ onDistance }: { onDistance: (meters: number, text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<{ tone: "muted" | "danger"; text: string } | null>(null);
  const device = useRef<Device | null>(null);
  const handler = useRef(onDistance);
  handler.current = onDistance;

  useEffect(() => {
    setSupported(!!bluetooth());
    return () => device.current?.gatt?.disconnect();
  }, []);

  if (!supported) return null;

  async function connect() {
    setState({ tone: "muted", text: "Recherche du télémètre..." });
    try {
      const d = await bluetooth()!.requestDevice({
        filters: LASER_PROFILES.map((p) => ({ services: [p.service] })),
        optionalServices: LASER_PROFILES.map((p) => p.service),
      });
      const server = await d.gatt!.connect();
      const services = await server.getPrimaryServices();
      const svc = services.find((s) => profileForService(s.uuid));
      const profile = svc ? profileForService(svc.uuid) : null;
      if (!svc || !profile) throw new Error("Appareil non reconnu : seuls les télémètres Leica DISTO et Bosch GLM sont pris en charge.");
      const ch = await svc.getCharacteristic(profile.characteristic);
      ch.addEventListener("characteristicvaluechanged", (e) => {
        const view = (e.target as Characteristic).value;
        const m = view ? profile.read(view) : null;
        if (m != null) handler.current(m, formatMeters(m));
      });
      await ch.startNotifications();
      if (profile.enable) await ch.writeValue(new Uint8Array(profile.enable));
      device.current = d;
      d.addEventListener("gattserverdisconnected", () => setState({ tone: "danger", text: "Télémètre déconnecté." }));
      setState({ tone: "muted", text: `${profile.label}${d.name ? ` (${d.name})` : ""} connecté : visez et mesurez, la cote se remplit seule.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setState({ tone: "danger", text: /cancel|annul/i.test(msg) || !msg ? "Connexion annulée." : msg });
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost min-h-8 text-sm" onClick={connect}>
        <Icon name="ruler" size={14} /> Télémètre Bluetooth
      </button>
      {state ? (
        <span role="status" className={`text-xs ${state.tone === "danger" ? "text-danger" : "text-muted"}`} data-testid="telemetre-etat">
          {state.text}
        </span>
      ) : null}
    </span>
  );
}
