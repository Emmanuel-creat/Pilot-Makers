/**
 * Questions de relance de l'assistant de préparation : quand une information manque pour chiffrer
 * (surface, hauteur sous plafond, type de support, accès), l'assistant la demande avec un champ de réponse.
 * Les réponses sont ajoutées à la description en phrases simples, puis la proposition est relancée :
 * l'artisan voit et peut corriger ce qui a été ajouté.
 */

import { normalizeText } from "@/lib/fuzzy";

export type FollowUpKind = "number" | "choice";

export interface FollowUp {
  id: string;
  question: string;
  kind: FollowUpKind;
  /** Unité de la réponse numérique */
  unit?: string;
  choices?: string[];
  /** Pourquoi la question est posée */
  why: string;
}

interface ProposalShape {
  sections: { lines: { kind: string; unit: string; label: string }[] }[];
  detected?: { surfaceM2: number | null; lengthMl: number | null };
}

/** Questions remplacées par une relance avec réponse : elles ne sont pas répétées dans la liste libre. */
export const REPLACED_QUESTIONS = [
  "Quelles sont les surfaces exactes ?",
  "Les matériaux sont-ils fournis par l'entreprise ?",
  "Y a-t-il des contraintes d'accès au chantier (étage, stationnement) ?",
  "L'évacuation des gravats est-elle à prévoir, et pour quel volume ?",
];

const SUPPORTS = ["plâtre ou plaque de plâtre", "béton ou chape", "bois ou parquet", "ancien carrelage", "enduit ou crépi"];
const ACCESS = ["accès de plain-pied", "étage sans ascenseur", "étage avec ascenseur", "stationnement difficile"];
const SUPPLY = ["fournis par l'entreprise", "fournis par le client"];

export function followUps(text: string, p: ProposalShape): FollowUp[] {
  const t = normalizeText(text);
  const lines = p.sections.flatMap((s) => s.lines);
  const has = (re: RegExp) => re.test(t);
  const out: FollowUp[] = [];
  const pendingIn = (unit: string) => lines.some((l) => l.kind === "pending" && l.unit === unit);

  if ((p.detected?.surfaceM2 ?? null) === null && (pendingIn("m²") || has(/\bsurface|\bsols?\b|\bmurs?\b|\bplafonds?\b/))) {
    out.push({
      id: "surface",
      question: "Quelle surface faut-il traiter ?",
      kind: "number",
      unit: "m²",
      why: "Les lignes au mètre carré restent à compléter sans surface.",
    });
  }
  if ((p.detected?.lengthMl ?? null) === null && pendingIn("ml")) {
    out.push({
      id: "longueur",
      question: "Quelle longueur faut-il prévoir ?",
      kind: "number",
      unit: "ml",
      why: "Les lignes au mètre linéaire restent à compléter sans longueur.",
    });
  }
  if (has(/\bmurs?\b|peint|faience|cloison|placo|plaque de platre|isolation/) && !has(/hauteur|sous plafond|\bhsp\b/)) {
    out.push({
      id: "hauteur",
      question: "Quelle est la hauteur sous plafond ?",
      kind: "number",
      unit: "m",
      why: "Elle fixe la surface des murs, le besoin d'échafaudage et la quantité de matériaux.",
    });
  }
  if (
    has(/peint|carrel|faience|enduit|revetement|parquet|sol souple|ragreage/) &&
    !has(/platre|placo|beton|chape|\bbois\b|parquet existant|ancien carrelage|carrelage existant|ciment|brique|parpaing|crepi|enduit existant/)
  ) {
    out.push({
      id: "support",
      question: "Sur quel support travaille-t-on ?",
      kind: "choice",
      choices: SUPPORTS,
      why: "La préparation du support (primaire, ragréage, ponçage) change selon sa nature.",
    });
  }
  if (has(/\bdepos|\bdemol/) && !has(/gravat|evacu|benne|decheter/)) {
    out.push({
      id: "gravats",
      question: "Quel volume de gravats faut-il évacuer ?",
      kind: "number",
      unit: "m³",
      why: "La dépose produit des déchets à évacuer et à facturer.",
    });
  }
  if (!has(/fourni|materiau|materiel/)) {
    out.push({
      id: "fournitures",
      question: "Qui fournit les matériaux ?",
      kind: "choice",
      choices: SUPPLY,
      why: "Les fournitures sont à chiffrer seulement si l'entreprise les apporte.",
    });
  }
  if (!has(/acces|etage|ascenseur|plain-pied|stationnement/)) {
    out.push({
      id: "acces",
      question: "Comment se présente l'accès au chantier ?",
      kind: "choice",
      choices: ACCESS,
      why: "Un étage sans ascenseur ou un stationnement difficile allonge la manutention.",
    });
  }
  return out;
}

const fr = (n: number) => String(n).replace(".", ",");

/** Réponse numérique saisie (virgule ou point) ; null si vide ou invalide. */
export function parseAnswer(v: string): number | null {
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** Phrases ajoutées à la description à partir des réponses (les réponses vides ou invalides sont ignorées). */
export function answersToText(items: FollowUp[], answers: Record<string, string>): string {
  const parts: string[] = [];
  for (const f of items) {
    const a = (answers[f.id] ?? "").trim();
    if (!a) continue;
    if (f.kind === "number") {
      const n = parseAnswer(a);
      if (n === null) continue;
      if (f.id === "surface") parts.push(`Surface à traiter : ${fr(n)} m².`);
      else if (f.id === "longueur") parts.push(`Longueur : ${fr(n)} ml.`);
      else if (f.id === "hauteur") parts.push(`Hauteur sous plafond : ${fr(n)} m.`);
      else if (f.id === "gravats") parts.push(`Évacuation des gravats : ${fr(n)} m³.`);
      continue;
    }
    if (!f.choices?.includes(a)) continue;
    if (f.id === "support") parts.push(`Support : ${a}.`);
    else if (f.id === "fournitures") parts.push(`Matériaux ${a}.`);
    else if (f.id === "acces") parts.push(`Accès : ${a}.`);
  }
  return parts.join(" ");
}
