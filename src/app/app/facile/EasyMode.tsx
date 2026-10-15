"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dictation } from "@/components/Dictation";
import { Icon } from "@/components/Icon";
import { type EasyTile, matchTile } from "@/lib/easy-mode";

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // Synthèse vocale indisponible : le texte reste affiché.
  }
}

/** Grands pictogrammes, lecture à voix haute et commande vocale qui ouvre l'écran demandé. */
export function EasyMode({ tiles, sentence }: { tiles: EasyTile[]; sentence: string }) {
  const router = useRouter();
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");

  function ask(text: string) {
    setHeard(text);
    const tile = matchTile(text, tiles);
    if (!tile) {
      const msg = "Je n'ai pas compris. Touchez une image, ou dites par exemple : faire un devis.";
      setAnswer(msg);
      speak(msg);
      return;
    }
    const msg = `J'ouvre : ${tile.label}.`;
    setAnswer(msg);
    speak(msg);
    router.push(tile.href);
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-4" aria-labelledby="facile-jour">
        <h2 id="facile-jour" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="sun" size={22} /> Ma journée
        </h2>
        <p className="text-lg leading-relaxed" data-testid="facile-phrase">
          {sentence}
        </p>
        <button type="button" className="btn-primary min-h-12 px-5 text-lg" onClick={() => speak(sentence)}>
          <Icon name="play" size={22} /> Écouter
        </button>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="facile-voix">
        <h2 id="facile-voix" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="mic" size={22} /> Dire ce que je veux faire
        </h2>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("demande");
            if (typeof v === "string" && v.trim()) ask(v);
          }}
        >
          <Dictation onText={ask} label="Parler" />
          <label htmlFor="facile-demande" className="sr-only">
            Ou écrire un mot
          </label>
          <input id="facile-demande" name="demande" className="field min-h-12 flex-1 text-lg" placeholder="Ou écrire un mot : devis, heures, frais" />
          <button type="submit" className="btn-secondary min-h-12 px-4 text-lg">
            <Icon name="right" size={22} /> Aller
          </button>
        </form>
        {answer ? (
          <p className="text-lg" role="status" data-testid="facile-reponse">
            {heard ? <span className="text-muted">« {heard} » : </span> : null}
            {answer}
          </p>
        ) : null}
      </section>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Que voulez-vous faire ?">
        {tiles.map((t) => (
          <li key={t.id} className="card flex flex-col items-stretch gap-2 p-3">
            <Link
              href={t.href}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg text-center text-lg font-semibold hover:bg-surface-2"
            >
              <Icon name={t.icon} size={48} />
              {t.label}
            </Link>
            <button type="button" className="btn-secondary min-h-11 justify-center" onClick={() => speak(t.say)} aria-label={`Écouter : ${t.label}`}>
              <Icon name="play" size={18} /> Écouter
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
