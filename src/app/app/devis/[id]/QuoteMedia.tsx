"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { apiFetch, ApiError } from "@/components/editor/api";

type Kind = "photo" | "croquis";
interface Media {
  id: string;
  kind: Kind;
  caption: string;
}
type Point = { x: number; y: number };
type Shape =
  | { type: "pen"; color: string; points: Point[] }
  | { type: "arrow"; color: string; from: Point; to: Point }
  | { type: "text"; color: string; at: Point; text: string };
type Tool = "pen" | "arrow" | "text";

const COLORS: [string, string][] = [
  ["#d92d20", "Rouge"],
  ["#17191d", "Noir"],
  ["#1d4ed8", "Bleu"],
];
const TOOLS: [Tool, string][] = [
  ["pen", "Trait libre"],
  ["arrow", "Flèche"],
  ["text", "Texte ou cote"],
];
const MAX_SIDE = 1600;
const SKETCH = { w: 1400, h: 900 };

function drawShape(c: CanvasRenderingContext2D, s: Shape, lw: number) {
  c.strokeStyle = s.color;
  c.fillStyle = s.color;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (s.type === "pen") {
    c.beginPath();
    s.points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
  } else if (s.type === "arrow") {
    const a = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
    const head = lw * 5;
    c.beginPath();
    c.moveTo(s.from.x, s.from.y);
    c.lineTo(s.to.x, s.to.y);
    c.stroke();
    c.beginPath();
    c.moveTo(s.to.x, s.to.y);
    c.lineTo(s.to.x - head * Math.cos(a - 0.45), s.to.y - head * Math.sin(a - 0.45));
    c.lineTo(s.to.x - head * Math.cos(a + 0.45), s.to.y - head * Math.sin(a + 0.45));
    c.closePath();
    c.fill();
  } else {
    const size = lw * 7;
    c.font = `600 ${size}px system-ui, sans-serif`;
    // Fond blanc sous le texte pour qu'il reste lisible sur la photo.
    const w = c.measureText(s.text).width;
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillRect(s.at.x - size * 0.2, s.at.y - size, w + size * 0.4, size * 1.3);
    c.fillStyle = s.color;
    c.fillText(s.text, s.at.x, s.at.y);
  }
}

/** Fenêtre d'annotation : photo ou feuille blanche, traits, flèches et cotes. */
function Annotator({
  kind,
  file,
  onDone,
  onCancel,
}: {
  kind: Kind;
  file: File | null;
  onDone: (blob: Blob, caption: string) => Promise<void>;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(kind === "croquis");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const draft = useRef<Shape | null>(null);
  const [tool, setTool] = useState<Tool>(kind === "croquis" ? "pen" : "arrow");
  const [color, setColor] = useState(COLORS[0][0]);
  const [label, setLabel] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lineWidth = () => Math.max(3, (canvas.current?.width ?? 1000) / 280);

  const redraw = useCallback(
    (extra?: Shape | null) => {
      const cv = canvas.current;
      if (!cv) return;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, cv.width, cv.height);
      if (base.current) c.drawImage(base.current, 0, 0, cv.width, cv.height);
      else {
        // Quadrillage léger du croquis, tous les 50 points.
        c.strokeStyle = "#e5e7eb";
        c.lineWidth = 1;
        for (let x = 50; x < cv.width; x += 50) c.strokeRect(x, 0, 0, cv.height);
        for (let y = 50; y < cv.height; y += 50) c.strokeRect(0, y, cv.width, 0);
      }
      for (const s of shapes) drawShape(c, s, lineWidth());
      if (extra) drawShape(c, extra, lineWidth());
    },
    [shapes],
  );

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    if (kind === "croquis" || !file) {
      cv.width = SKETCH.w;
      cv.height = SKETCH.h;
      redraw();
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      cv.width = Math.round(img.naturalWidth * scale);
      cv.height = Math.round(img.naturalHeight * scale);
      base.current = img;
      setReady(true);
    };
    img.onerror = () => setError("Image illisible : choisissez une photo JPEG ou PNG.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // Chargement unique à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  };

  async function save() {
    const cv = canvas.current!;
    setBusy(true);
    setError("");
    redraw();
    const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => cv.toBlob(res, type, q));
    let blob = kind === "croquis" ? await toBlob("image/png") : await toBlob("image/jpeg", 0.85);
    if (blob && blob.size > 1_400_000) blob = await toBlob("image/jpeg", 0.7);
    if (!blob) {
      setBusy(false);
      setError("Image impossible à préparer.");
      return;
    }
    try {
      await onDone(blob, caption);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Outils d'annotation">
        {TOOLS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tool === k}
            className={tool === k ? "btn-primary min-h-9 py-1" : "btn-secondary min-h-9 py-1"}
            onClick={() => setTool(k)}
          >
            {l}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {COLORS.map(([c, l]) => (
          <button
            key={c}
            type="button"
            aria-pressed={color === c}
            aria-label={`Couleur ${l.toLowerCase()}`}
            onClick={() => setColor(c)}
            className={`h-9 w-9 rounded-full border-2 ${color === c ? "border-ink" : "border-line"}`}
            style={{ background: c }}
          />
        ))}
        <button type="button" className="btn-ghost min-h-9 py-1" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>
          <Icon name="undo" size={16} /> Annuler
        </button>
      </div>
      {tool === "text" ? (
        <div>
          <label className="label" htmlFor="ann-text">
            Texte à placer (touchez l&apos;image ensuite)
          </label>
          <input id="ann-text" className="field" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : 2,40 m" />
        </div>
      ) : null}
      <canvas
        ref={canvas}
        role="img"
        aria-label={kind === "croquis" ? "Croquis : dessinez dans ce cadre" : "Photo à annoter"}
        data-testid="annotation"
        className="w-full touch-none rounded-md border border-line bg-white"
        onPointerDown={(e) => {
          const p = point(e);
          if (tool === "text") {
            if (label.trim()) setShapes((s) => [...s, { type: "text", color, at: p, text: label.trim() }]);
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          draft.current = tool === "pen" ? { type: "pen", color, points: [p] } : { type: "arrow", color, from: p, to: p };
        }}
        onPointerMove={(e) => {
          const d = draft.current;
          if (!d) return;
          const p = point(e);
          if (d.type === "pen") d.points.push(p);
          else if (d.type === "arrow") d.to = p;
          redraw(d);
        }}
        onPointerUp={() => {
          const d = draft.current;
          draft.current = null;
          if (d && (d.type !== "arrow" || Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) > 8)) setShapes((s) => [...s, d]);
          else redraw();
        }}
      />
      <div>
        <label className="label" htmlFor="ann-caption">
          Légende imprimée sous l&apos;image
        </label>
        <input
          id="ann-caption"
          className="field"
          value={caption}
          maxLength={160}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Ex. : mur nord, fissure à reprendre"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Abandonner
        </button>
        <button type="button" className="btn-primary" disabled={busy || !ready} onClick={save}>
          <Icon name="check" size={16} /> Ajouter au devis
        </button>
      </div>
    </div>
  );
}

/** Photos annotées et croquis du devis : ajout, légende, ordre et retrait. */
export function QuoteMedia({ quoteId, initial, editable }: { quoteId: string; initial: Media[]; editable: boolean }) {
  const [items, setItems] = useState<Media[]>(initial);
  const [open, setOpen] = useState<{ kind: Kind; file: File | null } | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = async () => setItems((await apiFetch<{ media: Media[] }>(`/api/quotes/${quoteId}/media`)).media);
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action impossible");
    }
  };

  async function upload(blob: Blob, caption: string) {
    const fd = new FormData();
    fd.set("image", blob, open!.kind === "croquis" ? "croquis.png" : "photo.jpg");
    fd.set("kind", open!.kind);
    fd.set("caption", caption);
    await apiFetch(`/api/quotes/${quoteId}/media`, { method: "POST", body: fd });
    setOpen(null);
    await reload();
  }

  if (!editable && !items.length) return null;
  return (
    <section className="card mt-6 p-4" aria-labelledby="photos-titre">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="photos-titre" className="text-sm font-semibold">
            Photos et croquis
          </h2>
          <p className="text-xs text-muted">Imprimés dans le PDF sous les totaux, deux par rangée. 8 images au plus.</p>
        </div>
        {editable && items.length < 8 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary min-h-9 py-1" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={16} /> Ajouter une photo
            </button>
            <button type="button" className="btn-secondary min-h-9 py-1" onClick={() => setOpen({ kind: "croquis", file: null })}>
              <Icon name="edit" size={16} /> Dessiner un croquis
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              aria-label="Photo du chantier"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setOpen({ kind: "photo", file: f });
              }}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="photos-devis">
          {items.map((m, i) => (
            <li key={m.id} className="rounded-md border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/quote-media/${m.id}`}
                alt={m.caption || (m.kind === "croquis" ? "Croquis" : "Photo")}
                className="max-h-48 w-full rounded object-contain"
              />
              {editable ? (
                <div className="mt-2 flex items-center gap-1">
                  <label className="sr-only" htmlFor={`cap-${m.id}`}>
                    Légende de l&apos;image {i + 1}
                  </label>
                  <input
                    id={`cap-${m.id}`}
                    className="field min-h-9 py-1 text-sm"
                    defaultValue={m.caption}
                    maxLength={160}
                    placeholder="Légende"
                    onBlur={(e) => {
                      if (e.target.value !== m.caption)
                        act(() => apiFetch(`/api/quote-media/${m.id}`, { method: "PATCH", json: { caption: e.target.value } }));
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost min-h-9 px-2"
                    aria-label={`Monter l'image ${i + 1}`}
                    disabled={i === 0}
                    onClick={() => act(() => apiFetch(`/api/quote-media/${m.id}`, { method: "PATCH", json: { move: "up" } }))}
                  >
                    <Icon name="up" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost min-h-9 px-2"
                    aria-label={`Descendre l'image ${i + 1}`}
                    disabled={i === items.length - 1}
                    onClick={() => act(() => apiFetch(`/api/quote-media/${m.id}`, { method: "PATCH", json: { move: "down" } }))}
                  >
                    <Icon name="down" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost min-h-9 px-2 text-danger"
                    aria-label={`Retirer l'image ${i + 1}`}
                    onClick={() => act(() => apiFetch(`/api/quote-media/${m.id}`, { method: "DELETE" }))}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ) : m.caption ? (
                <p className="mt-1 text-xs text-muted">{m.caption}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Montrez l&apos;existant ou les cotes au client : une photo annotée évite bien des malentendus.</p>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.kind === "croquis" ? "Croquis" : "Annoter la photo"} wide>
        {open ? (
          <Annotator key={`${open.kind}-${open.file?.name ?? ""}`} kind={open.kind} file={open.file} onDone={upload} onCancel={() => setOpen(null)} />
        ) : null}
      </Modal>
    </section>
  );
}
