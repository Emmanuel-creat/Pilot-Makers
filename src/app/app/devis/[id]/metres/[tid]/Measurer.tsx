"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addTakeoffLinesAction, saveTakeoffAction } from "@/app/actions";
import { quantity, quantityText, scaleFrom, TAKEOFF_KINDS, type Measurement, type Pt, type TakeoffKind } from "@/lib/takeoff";

const COLORS: Record<TakeoffKind, string> = { longueur: "#1f6feb", surface: "#2da44e", mur: "#bf8700", nombre: "#cf222e" };
type Mode = { tool: "etalonner" } | { tool: "relever"; id: string } | null;

const newId = () => Math.random().toString(36).slice(2, 10);
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Outil de métré : étalonnage sur une cote connue puis relevés cliqués sur le plan. */
export function Measurer(props: { id: string; quoteId: string; src: string; editable: boolean; pxPerM: number | null; measurements: Measurement[] }) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [pxPerM, setPxPerM] = useState<number | null>(props.pxPerM);
  const [items, setItems] = useState<Measurement[]>(props.measurements);
  const [mode, setMode] = useState<Mode>(props.pxPerM ? null : { tool: "etalonner" });
  const [cal, setCal] = useState<Pt[]>([]);
  const [calLength, setCalLength] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = props.src;
  }, [props.src]);

  const r = size ? Math.max(size.w, size.h) / 250 : 4;
  const active = mode?.tool === "relever" ? items.find((m) => m.id === mode.id) : undefined;

  function point(e: React.MouseEvent<SVGSVGElement>): Pt | null {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  }

  function click(e: React.MouseEvent<SVGSVGElement>) {
    if (!props.editable || !mode) return;
    const p = point(e);
    if (!p) return;
    if (mode.tool === "etalonner") setCal((c) => (c.length >= 2 ? [p] : [...c, p]));
    else setItems((all) => all.map((m) => (m.id === mode.id ? { ...m, points: [...m.points, p] } : m)));
  }

  function start(kind: TakeoffKind) {
    const id = newId();
    setItems((all) => [...all, { id, kind, label: "", points: [], ...(kind === "mur" ? { height: 2.5 } : {}) }]);
    setMode({ tool: "relever", id });
  }

  const update = (id: string, patch: Partial<Measurement>) => setItems((all) => all.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  function applyCalibration() {
    const meters = num(calLength);
    const s = cal.length === 2 && meters ? scaleFrom(cal[0], cal[1], meters) : null;
    if (!s) return setMessage({ ok: false, text: "Cliquez les deux extrémités d'une cote, puis indiquez sa longueur en mètres." });
    setPxPerM(Math.round(s * 1000) / 1000);
    setMode(null);
    setMessage({ ok: true, text: "Échelle enregistrée : vous pouvez relever." });
  }

  async function save() {
    setBusy(true);
    const res = await saveTakeoffAction(props.id, { pxPerM, measurements: items });
    setBusy(false);
    setMessage({ ok: !!res?.ok, text: res?.ok ? (res.message ?? "Enregistré.") : (res?.error ?? "Enregistrement impossible") });
  }

  async function addToQuote() {
    setBusy(true);
    const res = await addTakeoffLinesAction(props.id, { pxPerM, measurements: items }, selected);
    setBusy(false);
    if (res.ok && res.quoteId) router.push(`/app/devis/${res.quoteId}`);
    else setMessage({ ok: false, text: res.error ?? "Ajout impossible" });
  }

  const drawn = (m: Measurement) => {
    const color = COLORS[m.kind];
    const pts = m.points.map((p) => `${p.x},${p.y}`).join(" ");
    const isActive = active?.id === m.id;
    return (
      <g key={m.id} opacity={isActive || !active ? 1 : 0.55}>
        {m.kind === "surface" && m.points.length > 2 ? <polygon points={pts} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={r / 2} /> : null}
        {(m.kind === "longueur" || m.kind === "mur") && m.points.length > 1 ? <polyline points={pts} fill="none" stroke={color} strokeWidth={r / 1.5} /> : null}
        {m.points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={m.kind === "nombre" ? r * 1.4 : r} fill={color} stroke="#fff" strokeWidth={r / 3} />
        ))}
      </g>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        {props.editable ? (
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Outils de métré">
            <button type="button" className={mode?.tool === "etalonner" ? "btn-primary" : "btn-secondary"} onClick={() => setMode({ tool: "etalonner" })}>
              Échelle
            </button>
            {(Object.keys(TAKEOFF_KINDS) as TakeoffKind[]).map((k) => (
              <button key={k} type="button" className="btn-secondary" onClick={() => start(k)} disabled={!pxPerM && k !== "nombre"}>
                {TAKEOFF_KINDS[k].label}
              </button>
            ))}
            {active ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => update(active.id, { points: active.points.slice(0, -1) })}
                  disabled={!active.points.length}
                >
                  Annuler le dernier point
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMode(null)}>
                  Terminer le relevé
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        <p className="text-sm text-muted" aria-live="polite">
          {mode?.tool === "etalonner"
            ? "Cliquez les deux extrémités d'une cote connue du plan."
            : active
              ? `${TAKEOFF_KINDS[active.kind].label} : cliquez les points sur le plan${active.kind === "surface" ? " (le contour se ferme seul)" : ""}.`
              : pxPerM
                ? "Choisissez un outil pour relever une quantité."
                : "Indiquez d'abord l'échelle du plan."}
        </p>
        <div className="overflow-hidden rounded-md border border-line bg-white">
          <svg
            ref={svg}
            viewBox={size ? `0 0 ${size.w} ${size.h}` : "0 0 100 60"}
            className={`block h-auto w-full ${mode ? "cursor-crosshair" : ""}`}
            onClick={click}
            role="img"
            aria-label="Plan et relevés"
            data-testid="plan"
          >
            {size ? <image href={props.src} x={0} y={0} width={size.w} height={size.h} /> : null}
            {items.map(drawn)}
            {cal.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={r} fill="#8250df" stroke="#fff" strokeWidth={r / 3} />
            ))}
            {cal.length === 2 ? <line x1={cal[0].x} y1={cal[0].y} x2={cal[1].x} y2={cal[1].y} stroke="#8250df" strokeWidth={r / 1.5} /> : null}
          </svg>
        </div>
      </div>

      <aside className="h-fit space-y-4">
        {mode?.tool === "etalonner" && props.editable ? (
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Échelle du plan</h2>
            <p className="mb-2 text-muted">{cal.length}/2 points placés.</p>
            <label className="label" htmlFor="cal-length">
              Longueur réelle de la cote (m)
            </label>
            <input id="cal-length" inputMode="decimal" className="field" value={calLength} onChange={(e) => setCalLength(e.target.value)} />
            <button type="button" className="btn-primary mt-2" onClick={applyCalibration}>
              Valider l&apos;échelle
            </button>
          </section>
        ) : null}

        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">Relevés</h2>
          {items.length ? (
            <ul className="space-y-3" data-testid="releves">
              {items.map((m) => {
                const q = quantity(m, pxPerM);
                return (
                  <li key={m.id} className={`rounded-md border p-2 ${active?.id === m.id ? "border-accent" : "border-line"}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        aria-label={`Ajouter « ${m.label || TAKEOFF_KINDS[m.kind].label} » au devis`}
                        checked={selected.includes(m.id)}
                        disabled={q === null || !props.editable}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))}
                      />
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS[m.kind] }} aria-hidden="true" />
                      <span className="font-medium">{TAKEOFF_KINDS[m.kind].label}</span>
                      <span className="tabular ml-auto" data-testid="quantite">
                        {q === null ? "à compléter" : `${quantityText(q)} ${TAKEOFF_KINDS[m.kind].unit}`}
                      </span>
                    </div>
                    {props.editable ? (
                      <div className="mt-2 grid gap-2">
                        <input
                          className="field"
                          aria-label="Libellé de la ligne"
                          placeholder="Libellé de la ligne du devis"
                          value={m.label}
                          onChange={(e) => update(m.id, { label: e.target.value })}
                        />
                        {m.kind === "mur" || m.kind === "surface" ? (
                          <div className="grid grid-cols-2 gap-2">
                            {m.kind === "mur" ? (
                              <label className="text-xs text-muted">
                                Hauteur (m)
                                <input
                                  className="field"
                                  inputMode="decimal"
                                  defaultValue={m.height ?? ""}
                                  onChange={(e) => update(m.id, { height: num(e.target.value) })}
                                />
                              </label>
                            ) : null}
                            <label className="text-xs text-muted">
                              À déduire (m²)
                              <input
                                className="field"
                                inputMode="decimal"
                                defaultValue={m.deduct ?? ""}
                                onChange={(e) => update(m.id, { deduct: num(e.target.value) })}
                              />
                            </label>
                          </div>
                        ) : null}
                        <div className="flex gap-3 text-xs">
                          <button type="button" className="link inline-flex min-h-6 items-center" onClick={() => setMode({ tool: "relever", id: m.id })}>
                            Reprendre
                          </button>
                          <button
                            type="button"
                            className="link inline-flex min-h-6 items-center text-danger"
                            onClick={() => {
                              setItems((all) => all.filter((x) => x.id !== m.id));
                              setSelected((s) => s.filter((x) => x !== m.id));
                              if (active?.id === m.id) setMode(null);
                            }}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">Aucun relevé pour l&apos;instant.</p>
          )}
          {props.editable ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={save} disabled={busy}>
                Enregistrer
              </button>
              <button type="button" className="btn-primary" onClick={addToQuote} disabled={busy || !selected.length}>
                Ajouter au devis
              </button>
            </div>
          ) : null}
          {message ? (
            <p role={message.ok ? "status" : "alert"} className={`mt-2 ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
