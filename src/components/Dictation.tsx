"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Ajoute une ponctuation simple dictée à voix haute : « virgule », « point », « à la ligne ». */
export function spokenPunctuation(text: string): string {
  return text
    .replace(/\s*\b(virgule)\b/gi, ",")
    .replace(/\s*\bpoint (?:à|a) la ligne(?![\p{L}])\s*/giu, ".\n")
    .replace(/\s*(?<![\p{L}])(?:à|a) la ligne(?![\p{L}])\s*/giu, "\n")
    .replace(/\s*\bpoint\b(?!\s*(?:de|d'|du|des)\b)/gi, ".")
    .replace(/([.\n]\s*)(\p{Ll})/gu, (_, p: string, c: string) => p + c.toUpperCase())
    .trim();
}

/**
 * Bouton de dictée : la description se dicte au lieu de se taper, sur le chantier ou au volant à l'arrêt.
 * Utilise la reconnaissance vocale du navigateur ; masqué quand le navigateur ne la propose pas.
 */
export function Dictation({ onText, label = "Dicter" }: { onText: (text: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(!!recognitionClass());
    return () => rec.current?.stop();
  }, []);

  if (!supported) return null;

  const start = () => {
    const C = recognitionClass();
    if (!C) return;
    setError("");
    const r = new C();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal && res[0].transcript.trim()) onText(spokenPunctuation(res[0].transcript));
      }
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Autorisez le micro pour dicter." : "Dictée interrompue.");
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={listening ? "btn-primary min-h-8 px-2 py-1 text-xs" : "btn-ghost min-h-8 px-2 py-1 text-xs"}
        aria-pressed={listening}
        onClick={() => (listening ? rec.current?.stop() : start())}
      >
        <Icon name="mic" size={16} /> {listening ? "Arrêter la dictée" : label}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Ajoute un passage dicté à un texte existant, avec l'espace ou le retour à la ligne qui convient. */
export function appendDictated(current: string, add: string) {
  if (!current.trim()) return add.charAt(0).toUpperCase() + add.slice(1);
  const sep = /[\n]$/.test(current) ? "" : /[.!?]$/.test(current.trim()) ? " " : ", ";
  return current.replace(/\s+$/, (m) => (m.includes("\n") ? "\n" : "")) + sep + add;
}
