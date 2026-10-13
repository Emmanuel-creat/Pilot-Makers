"use client";

import { useEffect, useRef, useState } from "react";

/** Cadre de signature au doigt ou au stylet ; la valeur (image PNG) part dans un champ caché du formulaire. */
export function SignaturePad({ name, label, onChange }: { name: string; label: string; onChange?: (dataUrl: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);
  // Dimensionné à l'affichage, et de nouveau au premier trait si le cadre était masqué (fenêtre pas encore ouverte).
  const setup = () => {
    const c = canvas.current;
    if (!c || !c.offsetWidth || c.width === Math.round(c.offsetWidth * (window.devicePixelRatio || 1))) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.round(c.offsetWidth * ratio);
    c.height = Math.round(c.offsetHeight * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#17191d";
  };
  useEffect(setup, []);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <button
          type="button"
          className="btn-ghost min-h-8 px-2 py-1 text-xs"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setValue("");
            onChange?.("");
          }}
        >
          Effacer
        </button>
      </div>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${label} : signez dans ce cadre`}
        className="h-36 w-full touch-none rounded-md border border-line bg-white"
        onPointerDown={(e) => {
          if (!value) setup();
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          const url = e.currentTarget.toDataURL("image/png");
          setValue(url);
          onChange?.(url);
        }}
      />
      <input type="hidden" name={name} value={value} />
      {value ? null : <p className="mt-1 text-xs text-muted">Signature à faire au doigt ou au stylet.</p>}
    </div>
  );
}
