"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/** Saisie du code au clavier ou à la douchette, et lecture à la caméra quand le navigateur sait décoder les codes-barres. */
export function Scanner({ initial }: { initial: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stop || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: FORMATS });
        while (!stop && video.current) {
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) {
            stop = true;
            setActive(false);
            router.push(`/app/stock/scanner?code=${encodeURIComponent(found[0].rawValue)}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("Caméra indisponible : autorisez-la dans le navigateur ou saisissez le code.");
        setActive(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, router]);

  return (
    <div className="space-y-3">
      <form method="get" action="/app/stock/scanner" className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="scan-code">
            Code-barres ou référence
          </label>
          <input
            id="scan-code"
            name="code"
            className="field"
            defaultValue={initial}
            inputMode="text"
            autoComplete="off"
            autoFocus
            placeholder="Ex. 3270190012345"
          />
        </div>
        <button type="submit" className="btn-primary">
          Rechercher
        </button>
        {supported ? (
          <button type="button" className="btn-secondary" onClick={() => setActive((a) => !a)} aria-pressed={active}>
            {active ? "Arrêter la caméra" : "Scanner avec la caméra"}
          </button>
        ) : null}
      </form>
      {active ? <video ref={video} className="w-full max-w-md rounded-md border border-line" muted playsInline aria-label="Image de la caméra" /> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!supported ? (
        <p className="text-xs text-muted">
          Ce navigateur ne lit pas les codes à la caméra : saisissez le code ou utilisez une douchette, qui le tape à votre place.
        </p>
      ) : null}
    </div>
  );
}
