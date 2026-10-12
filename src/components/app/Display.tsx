"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Préférences d'affichage propres à l'appareil (thème, taille du texte, contraste),
 * enregistrées dans le navigateur et appliquées avant l'affichage par le script de la mise en page.
 */
export const DISPLAY_KEYS = { theme: "pm-theme", text: "pm-text", contrast: "pm-contrast" } as const;

const THEMES = [
  { value: "system", label: "Comme l'appareil" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];
const TEXTS = [
  { value: "md", label: "Normale" },
  { value: "lg", label: "Grande" },
  { value: "xl", label: "Très grande" },
];
const CONTRASTS = [
  { value: "normal", label: "Standard" },
  { value: "high", label: "Renforcé (chantier, plein soleil, gants)" },
];

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

function Choice({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={`btn-secondary cursor-pointer ${value === o.value ? "border-accent bg-accent-soft" : ""}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-accent"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DisplaySettings() {
  const [theme, setTheme] = useState("system");
  const [text, setText] = useState("md");
  const [contrast, setContrast] = useState("normal");
  useEffect(() => {
    const t = read(DISPLAY_KEYS.theme);
    setTheme(t === "light" || t === "dark" ? t : "system");
    setText(read(DISPLAY_KEYS.text) ?? "md");
    setContrast(read(DISPLAY_KEYS.contrast) === "high" ? "high" : "normal");
  }, []);
  const root = () => document.documentElement.dataset;
  return (
    <div className="space-y-4">
      <Choice
        name="theme"
        legend="Thème"
        options={THEMES}
        value={theme}
        onChange={(v) => {
          setTheme(v);
          if (v === "system") delete root().theme;
          else root().theme = v;
          write(DISPLAY_KEYS.theme, v === "system" ? null : v);
        }}
      />
      <Choice
        name="text"
        legend="Taille du texte"
        options={TEXTS}
        value={text}
        onChange={(v) => {
          setText(v);
          if (v === "md") delete root().text;
          else root().text = v;
          write(DISPLAY_KEYS.text, v === "md" ? null : v);
        }}
      />
      <Choice
        name="contrast"
        legend="Contraste et taille des boutons"
        options={CONTRASTS}
        value={contrast}
        onChange={(v) => {
          setContrast(v);
          if (v === "normal") delete root().contrast;
          else root().contrast = v;
          write(DISPLAY_KEYS.contrast, v === "normal" ? null : v);
        }}
      />
      <p className="text-xs text-muted">Ces réglages valent pour cet appareil et ce navigateur.</p>
    </div>
  );
}

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Bouton « Installer l'application » quand le navigateur le permet, sinon la marche à suivre. */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed) return <p className="text-sm text-muted">L'application est installée sur cet appareil.</p>;
  if (prompt)
    return (
      <button
        type="button"
        className="btn-primary"
        onClick={async () => {
          await prompt.prompt();
          if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
          setPrompt(null);
        }}
      >
        <Icon name="download" size={16} /> Installer l'application
      </button>
    );
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
      <li>iPhone et iPad (Safari) : bouton Partager, puis « Sur l'écran d'accueil ».</li>
      <li>Android (Chrome) : menu, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».</li>
      <li>Ordinateur (Chrome, Edge) : icône d'installation à droite de la barre d'adresse.</li>
    </ul>
  );
}

/** Enregistre le service de l'application installable (hors développement). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

export function ReloadButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
      <Icon name="refresh" size={16} /> Réessayer
    </button>
  );
}
