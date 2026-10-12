/**
 * Assistant de préparation de devis (module G).
 *
 * Règle fondamentale : l'assistant propose, l'artisan valide. Il n'invente
 * jamais silencieusement une quantité ou un prix :
 * - les prix viennent d'abord du catalogue de l'entreprise ;
 * - un prix issu de la bibliothèque est marqué « estimation » ;
 * - une quantité déduite du texte est marquée « estimée, à mesurer » ;
 * - une quantité inconnue donne une ligne « à compléter » ;
 * - le taux de TVA est seulement proposé, jamais décidé.
 *
 * Le moteur fourni fonctionne localement, par règles, sans envoyer de données à
 * un tiers. Un fournisseur de modèle de langage peut le remplacer via
 * l'interface AssistantProvider, à condition de respecter le même contrat de sortie.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bpToInput, price4ToInput } from "@/lib/calc/format";
import { badRequest } from "@/lib/http";
import { LIBRARY, LIBRARY_DATE } from "@/lib/library";
import { assertAiQuota } from "./billing";
import { searchItems, type CatalogItem } from "./catalog";
import type { Ctx } from "./context";
import { recordUsage, requireWritable } from "./context";
import type { DraftLine, DraftSection } from "./quote-types";

export interface AssistantProposal {
  summary: string;
  sections: DraftSection[];
  questions: string[];
  checklist: string[];
  warnings: string[];
  detected: { surfaceM2: number | null; lengthMl: number | null; rooms: string[] };
}

export interface AssistantProvider {
  name: string;
  propose(input: { text: string; catalog: CatalogItem[] }): Promise<AssistantProposal>;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9², ]/g, " ");

function parseNumber(s: string): number {
  return Number(s.replace(",", "."));
}

/** Repère les surfaces et longueurs citées : "6 m²", "6m2", "12 mètres carrés", "8 ml". */
export function detectMeasures(text: string) {
  const t = text.toLowerCase();
  const surfaces = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m²|m2|metres? carres?|mètres? carrés?)/g)].map((m) => parseNumber(m[1]));
  const lengths = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ml|metres? lineaires?|mètres? linéaires?)\b/g)].map((m) => parseNumber(m[1]));
  const roomWords = ["salle de bains", "salle de bain", "cuisine", "séjour", "salon", "chambre", "wc", "toilettes", "couloir", "entrée", "terrasse", "garage", "buanderie", "hall"];
  const rooms = roomWords.filter((r) => t.includes(r));
  return { surfaceM2: surfaces[0] ?? null, lengthMl: lengths[0] ?? null, rooms };
}

/** Mesure citée dans la même partie de phrase que la prestation (ex. « faïence murale sur 14 m² »). */
export function measureNear(text: string, trigger: RegExp) {
  for (const clause of text.split(/[;\n]|[.,](?!\d)|\bet\b|\bpuis\b/)) {
    if (!trigger.test(norm(clause))) continue;
    const m = detectMeasures(clause);
    if (m.surfaceM2 !== null || m.lengthMl !== null) return m;
  }
  return null;
}

interface Intent {
  section: string;
  keywords: string[];
  /** Mots de la description qui doivent figurer pour déclencher cette intention */
  triggers: RegExp;
  unitHint: string;
  questions: string[];
}

const INTENTS: Intent[] = [
  { section: "Préparation du chantier", triggers: /protect|bache/, keywords: ["protection"], unitHint: "forfait", questions: [] },
  {
    section: "Dépose et évacuation",
    triggers: /depos|demol|enlev|retir|arrach/,
    keywords: ["dépose", "démolition"],
    unitHint: "m²",
    questions: ["Quelle est la surface exacte à déposer ?", "L'évacuation des gravats est-elle à prévoir, et pour quel volume ?"],
  },
  { section: "Dépose et évacuation", triggers: /gravat|evacu|decheter/, keywords: ["gravats", "évacuation"], unitHint: "m³", questions: ["Quel volume de gravats faut-il évacuer ?"] },
  { section: "Préparation des supports", triggers: /ragre|nivel|chape/, keywords: ["ragréage", "chape"], unitHint: "m²", questions: ["Quel est l'état du support (planéité, humidité) ?"] },
  { section: "Préparation des supports", triggers: /etanch|douche/, keywords: ["étanchéité"], unitHint: "m²", questions: ["Quelle surface d'étanchéité faut-il traiter ?"] },
  {
    section: "Pose",
    triggers: /carrel|revetement|sol/,
    keywords: ["pose de carrelage", "carrelage"],
    unitHint: "m²",
    questions: ["Le carrelage est-il fourni par le client ou par l'entreprise ?", "Quel format de carreaux et quel type de pose (droite, diagonale) ?"],
  },
  { section: "Pose", triggers: /faience|mur|credence/, keywords: ["faïence"], unitHint: "m²", questions: ["Sur quelle hauteur faut-il poser la faïence ?"] },
  { section: "Pose", triggers: /peint|peindre/, keywords: ["peinture"], unitHint: "m²", questions: ["Quelle surface de murs et de plafonds faut-il peindre ?", "Les murs nécessitent-ils une préparation (rebouchage, ponçage) ?"] },
  { section: "Pose", triggers: /lavabo|vasque/, keywords: ["lavabo"], unitHint: "u", questions: [] },
  { section: "Pose", triggers: /\bwc\b|toilette/, keywords: ["wc"], unitHint: "u", questions: [] },
  { section: "Pose", triggers: /mitigeur|robinet/, keywords: ["mitigeur"], unitHint: "u", questions: [] },
  { section: "Pose", triggers: /prise/, keywords: ["prise"], unitHint: "u", questions: ["Combien de prises faut-il créer ?"] },
  { section: "Pose", triggers: /cloison|placo/, keywords: ["cloison"], unitHint: "m²", questions: ["Quelle est la surface de cloison à créer ?"] },
  { section: "Finitions", triggers: /joint/, keywords: ["joints"], unitHint: "m²", questions: [] },
  { section: "Finitions", triggers: /plinthe/, keywords: ["plinthes"], unitHint: "ml", questions: ["Quelle longueur de plinthes faut-il poser ?"] },
  { section: "Finitions", triggers: /nettoy/, keywords: ["nettoyage"], unitHint: "forfait", questions: [] },
];

const SECTION_ORDER = ["Préparation du chantier", "Dépose et évacuation", "Préparation des supports", "Pose", "Finitions"];

function score(itemName: string, keywords: string[], text: string): number {
  const n = norm(itemName);
  let s = 0;
  for (const k of keywords) if (n.includes(norm(k))) s += 3;
  for (const w of norm(text).split(/\s+/)) if (w.length > 4 && n.includes(w)) s += 1;
  // Une dépose ne doit jamais être proposée pour une pose, et inversement.
  const isRemoval = /\b(depose|demolition)\b/.test(n);
  const wantsRemoval = keywords.some((k) => /\b(depose|demolition)\b/.test(norm(k)));
  if (isRemoval !== wantsRemoval) s -= 10;
  return s;
}

function blankLine(p: Partial<DraftLine>): DraftLine {
  return {
    id: randomUUID(),
    kind: "item",
    catalogItemId: null,
    nature: "main_oeuvre",
    label: "",
    description: "",
    quantity: "",
    unit: "",
    unitPrice: "",
    unitCost: "",
    discountPercent: "",
    vatPercent: "",
    estimated: false,
    estimateNote: "",
    ...p,
  };
}

export const localProvider: AssistantProvider = {
  name: "local",
  async propose({ text, catalog }) {
    const t = norm(text);
    const measures = detectMeasures(text);
    const sections = new Map<string, DraftLine[]>();
    const questions = new Set<string>();
    const warnings: string[] = [];
    const used = new Set<string>();
    const libraryItems = Object.values(LIBRARY).flatMap((l) => l.items);

    for (const intent of INTENTS) {
      if (!intent.triggers.test(t)) continue;
      intent.questions.forEach((q) => questions.add(q));
      // 1. Catalogue de l'entreprise en priorité
      const fromCatalog = catalog
        .map((it) => ({ it, s: score(it.name + " " + it.subcategory, intent.keywords, text) }))
        .filter((x) => x.s >= 3 && !used.has(x.it.name))
        .sort((a, b) => b.s - a.s)[0];
      // 2. Sinon bibliothèque, avec prix marqué comme estimation
      const fromLibrary = fromCatalog
        ? null
        : libraryItems
            .map((it) => ({ it, s: score(it.name, intent.keywords, text) }))
            .filter((x) => x.s >= 3 && !used.has(x.it.name))
            .sort((a, b) => b.s - a.s)[0];
      const unit = fromCatalog?.it.unit ?? fromLibrary?.it.unit ?? intent.unitHint;
      let quantity = "";
      let estimated = false;
      let estimateNote = "";
      const near = measureNear(text, intent.triggers);
      const surface = near?.surfaceM2 ?? measures.surfaceM2;
      const length = near?.lengthMl ?? measures.lengthMl;
      if (unit === "m²" && surface !== null) {
        quantity = String(surface).replace(".", ",");
        estimated = true;
        estimateNote = `déduite de la description (${quantity} m²), à mesurer sur place`;
      } else if (unit === "ml" && length !== null) {
        quantity = String(length).replace(".", ",");
        estimated = true;
        estimateNote = `déduite de la description (${quantity} ml), à mesurer`;
      } else if (unit === "forfait" || unit === "u") {
        quantity = "1";
        estimated = true;
        estimateNote = "quantité par défaut, à confirmer";
      }
      let line: DraftLine;
      if (fromCatalog) {
        const it = fromCatalog.it;
        used.add(it.name);
        line = blankLine({
          catalogItemId: it.id,
          nature: it.category,
          label: it.name,
          description: it.description,
          unit: it.unit,
          unitPrice: price4ToInput(it.unit_price4),
          unitCost: it.unit_cost4 === null ? "" : price4ToInput(it.unit_cost4),
          vatPercent: bpToInput(it.vat_bp),
          quantity,
          estimated,
          estimateNote,
        });
      } else if (fromLibrary) {
        const it = fromLibrary.it;
        used.add(it.name);
        line = blankLine({
          nature: it.category ?? "main_oeuvre",
          label: it.name,
          description: it.description ?? "",
          unit: it.unit ?? unit,
          unitPrice: String(it.unit_price ?? ""),
          vatPercent: String(it.vat_percent ?? ""),
          quantity,
          estimated: true,
          estimateNote: `prix indicatif de la bibliothèque (${LIBRARY_DATE}), absent de votre catalogue${estimateNote ? " ; quantité " + estimateNote : ""}`,
        });
        warnings.push(`« ${it.name} » n'est pas dans votre catalogue : prix indicatif à remplacer par le vôtre.`);
      } else {
        line = blankLine({ kind: "pending", label: intent.keywords[0][0].toUpperCase() + intent.keywords[0].slice(1), unit });
      }
      if (line.kind === "item" && !line.quantity) {
        line.kind = "pending";
        questions.add(`Quelle quantité pour « ${line.label} » ?`);
      }
      const list = sections.get(intent.section) ?? [];
      if (!list.some((l) => l.label === line.label)) list.push(line);
      sections.set(intent.section, list);
    }

    if (sections.size === 0) {
      sections.set("Prestations", [blankLine({ kind: "pending", label: "Prestation à décrire" })]);
      questions.add("Pouvez-vous détailler les travaux à réaliser (nature, surfaces, fournitures) ?");
    }
    if (measures.surfaceM2 === null && /m²|surface|sol|mur/.test(t)) questions.add("Quelles sont les surfaces exactes ?");
    if (/fourni|materiau|materiel/.test(t) === false) questions.add("Les matériaux sont-ils fournis par l'entreprise ?");
    if (!/acces|etage|ascenseur/.test(t)) questions.add("Y a-t-il des contraintes d'accès au chantier (étage, stationnement) ?");
    questions.add("Quel temps de main-d'œuvre prévoyez-vous ?");

    const ordered = [...sections.entries()].sort((a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]));
    const firstSentence = text.trim().split(/[.!?\n]/)[0].trim();
    return {
      summary: firstSentence.length > 140 ? firstSentence.slice(0, 137) + "..." : firstSentence,
      sections: ordered.map(([title, lines]) => ({ id: randomUUID(), title, description: "", lines })),
      questions: [...questions],
      checklist: [
        "Vérifier chaque quantité marquée comme estimée",
        "Vérifier les prix unitaires et les remises",
        "Choisir le taux de TVA applicable à la situation du client",
        "Vérifier l'adresse du chantier et les coordonnées du client",
        "Relire la description des travaux",
      ],
      warnings,
      detected: measures,
    };
  },
};

export function getAssistantProvider(): AssistantProvider {
  return localProvider;
}

const inputSchema = z.object({ text: z.string().trim().min(10, "Décrivez le chantier en quelques phrases").max(4000) });

/** Limite les données personnelles transmises : adresses e-mail et numéros de téléphone sont masqués. */
export function minimizePersonalData(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g, "[téléphone]");
}

export async function proposeDraft(ctx: Ctx, raw: unknown): Promise<AssistantProposal> {
  requireWritable(ctx);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  await assertAiQuota(ctx.db, ctx);
  const provider = getAssistantProvider();
  const catalog = await searchItems(ctx, { limit: 2000 });
  const result = await provider.propose({ text: minimizePersonalData(parsed.data.text), catalog });
  // Coût mesuré par compte : nul pour le moteur local, à renseigner pour un fournisseur externe.
  await recordUsage(ctx.db, ctx.orgId, ctx.userId, "ai", 1, provider.name === "local" ? 0 : 2000);
  return result;
}
