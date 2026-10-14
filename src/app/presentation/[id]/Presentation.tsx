"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { formatEuros } from "@/lib/calc/format";
import { slideCount, type PresentationDeck } from "@/lib/presentation";

const frDate = (d: string) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";

/** Devis présenté écran par écran sur la tablette de l'artisan, jusqu'à la signature. */
export function Presentation({
  quoteId,
  deck,
  baseTtcCents,
  options,
  signature,
}: {
  quoteId: string;
  deck: PresentationDeck;
  baseTtcCents: number;
  options: { id: string; label: string; ttcCents: number }[];
  signature: ReactNode;
}) {
  const total = slideCount(deck);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const touch = useRef<number | null>(null);
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(total - 1, n))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [role=dialog]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(i + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const mediaIndex = deck.media.length ? 1 + deck.sections.length : -1;
  const withOptions = baseTtcCents + options.filter((o) => chosen.includes(o.id)).reduce((t, o) => t + o.ttcCents, 0);

  let content: ReactNode;
  if (i === 0) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        {deck.logo ? (
          <img src={deck.logo} alt={deck.orgName} className="max-h-24 max-w-64 object-contain" />
        ) : (
          <p className="text-2xl font-semibold">{deck.orgName}</p>
        )}
        <h1 className="text-balance text-3xl font-semibold sm:text-5xl">{deck.title || `Devis ${deck.number}`}</h1>
        <p className="text-lg text-muted">
          Pour {deck.customerName}
          {deck.site ? <span className="block">{deck.site}</span> : null}
        </p>
        <p className="text-sm text-muted">
          Devis {deck.number} du {frDate(deck.issueDate)}, valable jusqu&apos;au {frDate(deck.validUntil)}
        </p>
        {deck.description ? <p className="max-w-2xl whitespace-pre-line text-lg">{deck.description}</p> : null}
      </div>
    );
  } else if (i <= deck.sections.length) {
    const s = deck.sections[i - 1];
    content = (
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-4">
        <div>
          {s.group || s.variant ? <p className="text-sm uppercase tracking-wide text-muted">{[s.group, s.variant].filter(Boolean).join(" · ")}</p> : null}
          <h2 className="text-balance text-2xl font-semibold sm:text-4xl">{s.title || `Lot ${i}`}</h2>
          {s.description ? <p className="mt-2 whitespace-pre-line text-lg text-muted">{s.description}</p> : null}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {s.lines.map((l) =>
            l.note ? (
              <li key={l.id} className="py-3 text-lg italic text-muted">
                {l.label}
              </li>
            ) : (
              <li key={l.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-lg font-medium">
                    {l.label}
                    {l.optional ? <span className="ml-2 rounded bg-surface-2 px-2 py-0.5 text-sm font-normal">En option</span> : null}
                  </p>
                  {l.description ? <p className="whitespace-pre-line text-muted">{l.description}</p> : null}
                  {l.quantity ? <p className="text-sm text-muted">{l.quantity}</p> : null}
                </div>
                <span className="shrink-0 text-lg tabular">{formatEuros(l.netCents)}</span>
              </li>
            ),
          )}
        </ul>
        <p className="flex justify-between border-t border-line pt-3 text-xl font-semibold">
          <span>Total du lot HT</span>
          <span className="tabular">{formatEuros(s.subtotalCents)}</span>
        </p>
      </div>
    );
  } else if (i === mediaIndex) {
    content = (
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
        <h2 className="text-2xl font-semibold sm:text-4xl">Photos et croquis</h2>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto sm:grid-cols-2">
          {deck.media.map((m, k) => (
            <figure key={k} className="space-y-1">
              <img src={m.dataUrl} alt={m.caption || `Photo ${k + 1}`} className="w-full rounded-md object-contain" />
              {m.caption ? <figcaption className="text-muted">{m.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
    );
  } else {
    content = (
      <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-6">
        <h2 className="text-2xl font-semibold sm:text-4xl">Récapitulatif</h2>
        <dl className="space-y-2 text-lg">
          <div className="flex justify-between">
            <dt>Total HT</dt>
            <dd className="tabular">{formatEuros(deck.totals.htCents)}</dd>
          </div>
          {!deck.totals.exempt ? (
            <div className="flex justify-between">
              <dt>TVA</dt>
              <dd className="tabular">{formatEuros(deck.totals.vatCents)}</dd>
            </div>
          ) : null}
        </dl>
        {options.length ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-lg font-medium">Options à ajouter</legend>
            {options.map((o) => (
              <label key={o.id} className="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-lg">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-6 w-6"
                    checked={chosen.includes(o.id)}
                    onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.id] : c.filter((x) => x !== o.id)))}
                  />
                  {o.label}
                </span>
                <span className="tabular">+ {formatEuros(o.ttcCents)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <p className="flex justify-between border-t border-line pt-4 text-3xl font-semibold" data-testid="presentation-total">
          <span>{deck.totals.exempt ? "Total" : "Total TTC"}</span>
          <span className="tabular">{formatEuros(withOptions)}</span>
        </p>
        <ul className="space-y-1 text-muted">
          {deck.estimatedStart ? <li>Démarrage envisagé : {deck.estimatedStart}</li> : null}
          {deck.estimatedDuration ? <li>Durée estimée : {deck.estimatedDuration}</li> : null}
          {deck.depositPercent ? <li>Acompte à la commande : {deck.depositPercent} %</li> : null}
        </ul>
        <div>{signature}</div>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh flex-col bg-bg text-ink"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? i + 1 : i - 1);
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-sm">
        <Link href={`/app/devis/${quoteId}`} className="btn-ghost">
          <Icon name="left" size={16} /> Quitter la présentation
        </Link>
        <span className="text-muted tabular" aria-live="polite">
          Écran {i + 1} sur {total}
        </span>
        <button type="button" className="btn-ghost" onClick={fullscreen}>
          Plein écran
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10" style={{ ["--color-accent" as string]: deck.accentColor || undefined }}>
        {content}
      </main>
      <nav className="flex items-center justify-between gap-2 border-t border-line px-4 py-3" aria-label="Écrans de la présentation">
        <button type="button" className="btn-secondary" onClick={() => go(i - 1)} disabled={i === 0}>
          <Icon name="left" size={16} /> Précédent
        </button>
        <div className="hidden gap-0.5 sm:flex">
          {Array.from({ length: total }, (_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Aller à l'écran ${k + 1}`}
              aria-current={k === i ? "step" : undefined}
              onClick={() => go(k)}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span className={`block h-3 w-3 rounded-full ${k === i ? "bg-accent" : "border border-line bg-surface-2"}`} />
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={() => go(i + 1)} disabled={i === total - 1}>
          Suivant <Icon name="right" size={16} />
        </button>
      </nav>
    </div>
  );
}
