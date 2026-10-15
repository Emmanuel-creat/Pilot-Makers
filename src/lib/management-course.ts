/**
 * Parcours de gestion d'entreprise artisanale : huit modules de la formation continue, puis un examen final de
 * douze questions tirées au sort parmi les leurs. L'examen réussi (neuf bonnes réponses sur douze) donne une
 * attestation de réussite numérotée, vérifiable en ligne par un client, une banque ou un donneur d'ordre.
 *
 * C'est une attestation de réussite, pas une certification inscrite au répertoire national : celle-ci demande un
 * organisme de formation certifié. Fonctions pures.
 */

import { moduleById, type Question } from "./training";

export const COURSE = {
  id: "gestion-entreprise",
  title: "Gestion d'entreprise artisanale",
  modules: [
    "prix-de-revient",
    "marge-coefficient",
    "tresorerie-delais",
    "tva-batiment",
    "facture-electronique",
    "recouvrement",
    "assurances-garanties",
    "pilotage-indicateurs",
  ],
  examSize: 12,
  passMark: 9,
} as const;

export interface ExamQuestion extends Question {
  /** Module d'origine et rang de la question dans son questionnaire */
  ref: string;
}

/** Toutes les questions des modules du parcours */
export function questionPool(): ExamQuestion[] {
  return COURSE.modules.flatMap((id) => moduleById(id)!.quiz.map((q, i) => ({ ...q, ref: `${id}:${i}` })));
}

/** Générateur pseudo-aléatoire reproductible (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sujet de l'examen pour une graine donnée : toujours le même pour la même graine, au moins une question par module. */
export function examQuestions(seed: number): ExamQuestion[] {
  const r = rng(seed);
  const pool = questionPool();
  const pick = (list: ExamQuestion[]) => list[Math.floor(r() * list.length)];
  const chosen = COURSE.modules.map((id) => pick(pool.filter((q) => q.ref.startsWith(`${id}:`))));
  const rest = pool.filter((q) => !chosen.includes(q));
  while (chosen.length < COURSE.examSize) chosen.push(rest.splice(Math.floor(r() * rest.length), 1)[0]);
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

export function gradeExam(seed: number, answers: (number | null)[]) {
  const qs = examQuestions(seed);
  const corrections = qs.map((q, i) => ({ q: q.q, ok: answers[i] === q.answer, why: q.why }));
  const score = corrections.filter((c) => c.ok).length;
  return { score, total: qs.length, passed: score >= COURSE.passMark, corrections };
}

/** Modules du parcours restant à valider */
export const missingModules = (passed: ReadonlySet<string>) => COURSE.modules.filter((id) => !passed.has(id));

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Numéro d'attestation lisible au téléphone, sans caractères ambigus : GEA-XXXX-XXXX */
export function certificateCode(bytes: Uint8Array): string {
  const c = Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `GEA-${c.slice(0, 4)}-${c.slice(4, 8)}`;
}

export const CODE_PATTERN = /^GEA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
