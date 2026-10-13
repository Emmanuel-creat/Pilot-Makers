"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dictation } from "@/components/Dictation";
import { apiFetch } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

interface Field {
  name: string;
  label: string;
  value: string;
  options?: { value: string; label: string }[];
  type?: "text" | "date";
}
type Plan =
  | { kind: "go"; say: string; href: string }
  | { kind: "answer"; say: string; href?: string; linkLabel?: string }
  | { kind: "confirm"; action: string; title: string; say: string; fields: Field[] };

const VOICE_KEY = "pm-assistant-voix";

function speak(text: string) {
  try {
    if (localStorage.getItem(VOICE_KEY) !== "1" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // Synthèse vocale indisponible : la réponse reste affichée.
  }
}

/**
 * Assistant vocal de l'application : une demande dictée ou tapée, une action préparée,
 * relue et confirmée avant d'être faite.
 */
export function VoiceAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ say: string; href: string } | null>(null);
  const [voice, setVoice] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
    } catch {
      // Stockage local indisponible.
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const reset = () => {
    setPlan(null);
    setDone(null);
    setError("");
  };

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    reset();
    try {
      const p = await apiFetch<Plan>("/api/voice", { method: "POST", json: { text } });
      speak(p.say);
      if (p.kind === "go") {
        setPlan(p);
        router.push(p.href);
        setOpen(false);
        setText("");
        return;
      }
      setPlan(p);
      if (p.kind === "confirm") setValues(Object.fromEntries(p.fields.map((f) => [f.name, f.value])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (plan?.kind !== "confirm") return;
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ say: string; href: string }>("/api/voice/execute", {
        method: "POST",
        json: { action: plan.action, values },
      });
      speak(r.say);
      setDone(r);
      setPlan(null);
      setText("");
      router.push(r.href);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary px-3" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="assistant-vocal" aria-label="Assistant vocal">
        <Icon name="mic" size={16} /> <span className="hidden sm:inline">Assistant</span>
      </button>
      {open ? (
        <section
          id="assistant-vocal"
          aria-labelledby="assistant-vocal-titre"
          className="fixed inset-x-2 top-14 z-40 max-h-[80vh] overflow-y-auto rounded-lg border border-line bg-surface p-4 shadow-lg sm:left-auto sm:right-4 sm:w-[28rem]"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 id="assistant-vocal-titre" className="font-semibold">
              Assistant vocal
            </h2>
            <button type="button" className="btn-ghost min-h-8 px-2" onClick={() => setOpen(false)} aria-label="Fermer l'assistant">
              <Icon name="x" size={16} />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">Demandez à voix haute ou écrivez. Chaque action vous est présentée pour relecture avant d'être faite.</p>
          <form onSubmit={ask} className="mt-3 space-y-2">
            <label className="sr-only" htmlFor="assistant-demande">
              Votre demande
            </label>
            <textarea
              id="assistant-demande"
              ref={input}
              rows={2}
              className="field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) ask(e);
              }}
              placeholder="Ex. : crée un devis pour Durand salle de bain"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Dictation raw label="Parler" onText={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))} />
              <button className="btn-primary min-h-9" disabled={busy || !text.trim()}>
                {busy && !plan ? "Analyse..." : "Demander"}
              </button>
              <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={voice}
                  onChange={(e) => {
                    setVoice(e.target.checked);
                    try {
                      localStorage.setItem(VOICE_KEY, e.target.checked ? "1" : "0");
                    } catch {
                      // Préférence non mémorisée.
                    }
                  }}
                />
                Réponse à voix haute
              </label>
            </div>
          </form>

          {error ? (
            <p role="alert" className="mt-3 rounded-md bg-danger-soft p-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {plan && plan.kind !== "go" ? (
            <div className="mt-4 rounded-md bg-surface-2 p-3 text-sm" role="status" data-testid="assistant-reponse">
              <p>{plan.say}</p>
              {plan.kind === "answer" && plan.href ? (
                <Link href={plan.href} className="link mt-2 inline-block" onClick={() => setOpen(false)}>
                  {plan.linkLabel ?? "Ouvrir"}
                </Link>
              ) : null}
              {plan.kind === "confirm" ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirm();
                  }}
                >
                  <p className="font-medium">{plan.title} : relisez avant de confirmer</p>
                  {plan.fields.map((f) => (
                    <div key={f.name}>
                      <label className="label" htmlFor={`va-${f.name}`}>
                        {f.label}
                      </label>
                      {f.options ? (
                        <select
                          id={`va-${f.name}`}
                          className="field"
                          value={values[f.name] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                        >
                          {f.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`va-${f.name}`}
                          type={f.type ?? "text"}
                          className="field"
                          value={values[f.name] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button className="btn-primary min-h-9" disabled={busy}>
                      <Icon name="check" size={16} /> {busy ? "En cours..." : "Confirmer"}
                    </button>
                    <button type="button" className="btn-ghost min-h-9" onClick={reset}>
                      Annuler
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}

          {done ? (
            <p role="status" className="mt-4 rounded-md bg-success-soft p-2 text-sm text-success">
              {done.say}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
