"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMenuAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { DEFAULT_MAIN, DEFAULT_MOBILE, MOBILE_SLOTS } from "@/lib/menu";

interface Mod {
  key: string;
  label: string;
  icon: string;
  hint: string;
}

/** Choix des briques du menu : affichage, ordre et raccourcis de la barre du téléphone. */
export function MenuEditor({ modules, initialMain, initialMobile }: { modules: Mod[]; initialMain: string[]; initialMobile: string[] }) {
  const router = useRouter();
  const [main, setMain] = useState(initialMain);
  const [mobile, setMobile] = useState(initialMobile);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const hidden = modules.filter((m) => !main.includes(m.key));

  const move = (key: string, delta: number) =>
    setMain((list) => {
      const i = list.indexOf(key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggleMobile = (key: string) =>
    setMobile((list) => (list.includes(key) ? list.filter((k) => k !== key) : list.length < MOBILE_SLOTS ? [...list, key] : list));
  const remove = (key: string) => {
    setMain((list) => list.filter((k) => k !== key));
    setMobile((list) => list.filter((k) => k !== key));
  };

  const save = (reset = false) =>
    start(async () => {
      const r = await saveMenuAction(reset ? null : { main, mobile });
      if (r?.ok && reset) {
        setMain(DEFAULT_MAIN.filter((k) => byKey.has(k)));
        setMobile(DEFAULT_MOBILE.filter((k) => byKey.has(k)));
      }
      setMessage(r?.ok ? { ok: true, text: r.message ?? "Menu enregistré." } : { ok: false, text: r?.error ?? "Enregistrement impossible" });
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <section className="card p-4" aria-labelledby="menu-affiche">
        <h2 id="menu-affiche" className="font-semibold">
          Dans mon menu ({main.length})
        </h2>
        <p className="mt-1 text-sm text-muted">
          Le tableau de bord reste toujours en tête. Cochez « Téléphone » pour placer une brique dans la barre du bas ({MOBILE_SLOTS} au plus).
        </p>
        {main.length === 0 ? <p className="mt-3 text-sm">Aucune brique : seul le tableau de bord sera affiché.</p> : null}
        <ul className="mt-3 divide-y divide-line" data-testid="menu-choisi">
          {main.map((key, i) => {
            const m = byKey.get(key);
            if (!m) return null;
            const onPhone = mobile.includes(key);
            return (
              <li key={key} className="flex flex-wrap items-center gap-2 py-2">
                <Icon name={m.icon} className="text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-muted">{m.hint}</span>
                </span>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={onPhone} disabled={!onPhone && mobile.length >= MOBILE_SLOTS} onChange={() => toggleMobile(key)} />
                  Téléphone
                </label>
                <button type="button" className="btn-ghost min-h-9 px-2" onClick={() => move(key, -1)} disabled={i === 0} aria-label={`Monter ${m.label}`}>
                  <Icon name="up" size={16} />
                </button>
                <button
                  type="button"
                  className="btn-ghost min-h-9 px-2"
                  onClick={() => move(key, 1)}
                  disabled={i === main.length - 1}
                  aria-label={`Descendre ${m.label}`}
                >
                  <Icon name="down" size={16} />
                </button>
                <button type="button" className="btn-ghost min-h-9 px-2" onClick={() => remove(key)} aria-label={`Retirer ${m.label}`}>
                  <Icon name="x" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {hidden.length ? (
        <section className="card p-4" aria-labelledby="menu-dispo">
          <h2 id="menu-dispo" className="font-semibold">
            Briques disponibles
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {hidden.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-md border border-line p-3 text-left hover:border-accent/40"
                  onClick={() => setMain((list) => [...list, m.key])}
                  aria-label={`Ajouter ${m.label}`}
                >
                  <Icon name="plus" className="mt-0.5 text-accent" size={16} />
                  <span>
                    <span className="block font-medium">{m.label}</span>
                    <span className="block text-xs text-muted">{m.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => save()} disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer mon menu"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => save(true)} disabled={pending}>
          Revenir au menu d'origine
        </button>
        {message ? (
          <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
