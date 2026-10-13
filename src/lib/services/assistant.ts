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
 * un tiers. Un service externe d'analyse de texte peut le remplacer via
 * l'interface AssistantProvider, à condition de respecter le même contrat de sortie.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bpToInput, price4ToInput } from "@/lib/calc/format";
import { badRequest, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { LIBRARY, LIBRARY_DATE, tradeForProfession, type LibraryTrade } from "@/lib/library";
import { assertAiQuota } from "./billing";
import { searchItems, type CatalogItem } from "./catalog";
import type { Ctx } from "./context";
import { recordUsage, requireWritable } from "./context";
import type { DraftLine, DraftSection } from "./quote-types";
import { followUps, REPLACED_QUESTIONS, type FollowUp } from "./assistant-followups";
import { assistantQuality, habitKey, loadHabits, samePrice, type Habit, type ProposedLine } from "./assistant-habits";

export interface AssistantProposal {
  summary: string;
  sections: DraftSection[];
  questions: string[];
  checklist: string[];
  warnings: string[];
  /** Pourquoi chaque ligne est proposée, par identifiant de ligne */
  explanations: Record<string, string>;
  /** Métiers reconnus dans la description */
  trades: { code: LibraryTrade; label: string }[];
  detected: { surfaceM2: number | null; lengthMl: number | null; volumeM3?: number | null; rooms: string[] };
  /** Informations manquantes, avec un champ de réponse ; les réponses complètent la description */
  followUps?: FollowUp[];
  /** Proposition conservée, pour mesurer ce qui est gardé à l'émission */
  proposalId?: string;
  /** Lignes ajustées selon les habitudes de l'entreprise */
  habitsApplied?: number;
  /** Part des lignes proposées gardées telles quelles sur les devis émis */
  quality?: { lines: number; keptPercent: number | null };
}

export interface AssistantProvider {
  name: string;
  propose(input: { text: string; catalog: CatalogItem[]; profession?: string }): Promise<AssistantProposal>;
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
  const volumes = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m³|m3|metres? cubes?|mètres? cubes?)/g)].map((m) => parseNumber(m[1]));
  const roomWords = [
    "salle de bains",
    "salle de bain",
    "cuisine",
    "séjour",
    "salon",
    "chambre",
    "wc",
    "toilettes",
    "couloir",
    "entrée",
    "terrasse",
    "garage",
    "buanderie",
    "hall",
  ];
  const rooms = roomWords.filter((r) => t.includes(r));
  return { surfaceM2: surfaces[0] ?? null, lengthMl: lengths[0] ?? null, volumeM3: volumes[0] ?? null, rooms };
}

const SECTION_ORDER = [
  "Préparation du chantier",
  "Dépose et évacuation",
  "Terrassement",
  "Préparation des supports",
  "Gros œuvre",
  "Charpente",
  "Couverture",
  "Zinguerie",
  "Isolation",
  "Réseaux",
  "Travaux",
  "Menuiseries",
  "Pose",
  "Peinture",
  "Façade",
  "Métallerie",
  "Équipements",
  "Agencement",
  "Aménagement",
  "Plantations",
  "Entretien",
  "Fournitures",
  "Finitions",
];

const REMOVAL = /\b(depose|demolition)\b/;

/** Pertinence d'un élément du catalogue de l'entreprise pour une prestation de la bibliothèque. */
function score(itemName: string, keywords: string[]): number {
  const n = norm(itemName);
  let s = 0;
  for (const k of keywords) if (n.includes(norm(k))) s += 3;
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

/** Découpe la description en parties de phrase ; une virgule décimale (14,5) ne coupe pas. */
export function splitClauses(text: string): string[] {
  return text
    .split(/[;\n]|[.,](?!\d)|\bet\b|\bpuis\b|\bainsi que\b/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const NUMBER_WORDS: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12 };

/** Nombre d'unités cité dans une partie de phrase (« 4 prises », « trois radiateurs »), hors mesures. */
export function countIn(clause: string): number | null {
  const t = clause.toLowerCase();
  const m = t.match(/(?:^|\s)(\d{1,3})\s+(?!m²|m2\b|m3\b|m³|m\b|ml\b|cm\b|mm\b|%|€|h\b|l\b|ans?\b|jours?\b|mois\b|semaines?\b|kw|euros?\b)/);
  if (m) return Number(m[1]);
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\s+\\p{L}`, "u").test(t)) return n;
  return null;
}

const plural = (n: number) => (n > 1 ? "s" : "");

export const localProvider: AssistantProvider = {
  name: "local",
  async propose({ text, catalog, profession }) {
    const t = norm(text);
    const measures = detectMeasures(text);
    const clauses = splitClauses(text).map((raw) => ({ raw, n: norm(raw) }));
    const sections = new Map<string, DraftLine[]>();
    const explanations: Record<string, string> = {};
    const questions = new Set<string>();
    const warnings: string[] = [];
    const usedNames = new Set<string>();
    const usedCatalog = new Set<string>();

    const trades: LibraryTrade[] = (Object.keys(LIBRARY) as LibraryTrade[]).filter((c) => c !== "commun");
    const detected = trades.filter((c) => LIBRARY[c].detect.test(t));
    const preferred = profession ? tradeForProfession(profession) : null;
    // Sans métier reconnu, toutes les bibliothèques sont consultées, celle du métier de l'entreprise d'abord.
    const active = detected.length ? detected : preferred ? [preferred, ...trades.filter((c) => c !== preferred)] : trades;
    if (preferred && detected.includes(preferred)) active.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));

    for (const trade of ["commun" as LibraryTrade, ...active]) {
      for (const lib of LIBRARY[trade].items) {
        if (!lib.when || usedNames.has(lib.name)) continue;
        const clause = clauses.find((c) => lib.when!.every((r) => r.test(c.n)));
        if (!clause) continue;
        usedNames.add(lib.name);

        // 1. Catalogue de l'entreprise en priorité
        const libRemoval = REMOVAL.test(norm(lib.name));
        const need = 3 * Math.min(2, lib.keywords.length);
        const fromCatalog = catalog
          .filter((it) => !usedCatalog.has(it.id) && REMOVAL.test(norm(it.name)) === libRemoval)
          .map((it) => ({ it, s: norm(it.name) === norm(lib.name) ? 100 : score(it.name + " " + it.subcategory, lib.keywords) }))
          .filter((x) => x.s >= need)
          .sort((a, b) => b.s - a.s)[0]?.it;

        // 2. Quantité : mesure de la même partie de phrase, sinon de la description, toujours à vérifier
        const unit = fromCatalog?.unit ?? lib.unit ?? "u";
        const local = detectMeasures(clause.raw);
        let quantity = "";
        let qtyNote = "";
        if (unit === "m²" && (local.surfaceM2 ?? measures.surfaceM2) !== null) {
          quantity = String(local.surfaceM2 ?? measures.surfaceM2).replace(".", ",");
          qtyNote = `déduite de la description (${quantity} m²), à mesurer sur place`;
        } else if (unit === "ml" && (local.lengthMl ?? measures.lengthMl) !== null) {
          quantity = String(local.lengthMl ?? measures.lengthMl).replace(".", ",");
          qtyNote = `déduite de la description (${quantity} ml), à mesurer`;
        } else if (unit === "m³" && local.volumeM3 !== null) {
          // Un volume ne se reprend que de la même partie de phrase : celui des gravats n'est pas celui du béton.
          quantity = String(local.volumeM3).replace(".", ",");
          qtyNote = `déduite de la description (${quantity} m³), à confirmer`;
        } else if (unit === "u") {
          const n = countIn(clause.raw);
          quantity = String(n ?? 1);
          qtyNote = n ? `${n} unité${plural(n)} citée${plural(n)} dans la description, à confirmer` : "quantité par défaut, à confirmer";
        } else if (unit === "forfait") {
          quantity = "1";
          qtyNote = "quantité par défaut, à confirmer";
        }

        let line: DraftLine;
        if (fromCatalog) {
          usedCatalog.add(fromCatalog.id);
          line = blankLine({
            catalogItemId: fromCatalog.id,
            nature: fromCatalog.category,
            label: fromCatalog.name,
            description: fromCatalog.description,
            unit: fromCatalog.unit,
            unitPrice: price4ToInput(fromCatalog.unit_price4),
            unitCost: fromCatalog.unit_cost4 === null ? "" : price4ToInput(fromCatalog.unit_cost4),
            vatPercent: bpToInput(fromCatalog.vat_bp),
            quantity,
            estimated: Boolean(quantity),
            estimateNote: qtyNote,
          });
        } else {
          line = blankLine({
            nature: lib.category ?? "main_oeuvre",
            label: lib.name,
            description: lib.description ?? "",
            unit,
            unitPrice: String(lib.unit_price ?? ""),
            vatPercent: String(lib.vat_percent ?? ""),
            quantity,
            estimated: true,
            estimateNote: `prix indicatif de la bibliothèque (${LIBRARY_DATE}), absent de votre catalogue${qtyNote ? " ; quantité " + qtyNote : ""}`,
          });
          warnings.push(`« ${lib.name} » n'est pas dans votre catalogue : prix indicatif à remplacer par le vôtre.`);
        }
        if (!line.quantity) {
          line.kind = "pending";
          line.estimated = false;
          questions.add(`Quelle quantité pour « ${line.label} » (${unit}) ?`);
        }
        const excerpt = clause.raw.length > 90 ? clause.raw.slice(0, 87) + "..." : clause.raw;
        explanations[line.id] = [
          `Proposée car la description mentionne « ${excerpt} ».`,
          fromCatalog ? "Prix repris de votre catalogue." : "Prix indicatif de la bibliothèque, à remplacer par le vôtre.",
          lib.tip ?? "",
        ]
          .filter(Boolean)
          .join(" ");
        const section = lib.section;
        const list = sections.get(section) ?? [];
        list.push(line);
        sections.set(section, list);
      }
    }

    if (sections.size === 0) {
      const line = blankLine({ kind: "pending", label: "Prestation à décrire" });
      sections.set("Prestations", [line]);
      explanations[line.id] = "Aucune prestation connue n'a été reconnue : complétez cette ligne ou détaillez la description.";
      questions.add("Pouvez-vous détailler les travaux à réaliser (nature, surfaces, fournitures) ?");
    }
    if (detected.length) for (const c of detected) LIBRARY[c].questions.forEach((q) => questions.add(q));
    if (/\bdepos|\bdemol/.test(t) && !/gravat|evacu|benne|decheter/.test(t))
      questions.add("L'évacuation des gravats est-elle à prévoir, et pour quel volume ?");
    if (measures.surfaceM2 === null && /m²|surface|\bsol\b|\bmurs?\b/.test(t)) questions.add("Quelles sont les surfaces exactes ?");
    if (!/fourni|materiau|materiel/.test(t)) questions.add("Les matériaux sont-ils fournis par l'entreprise ?");
    if (!/acces|etage|ascenseur/.test(t)) questions.add("Y a-t-il des contraintes d'accès au chantier (étage, stationnement) ?");
    questions.add("Quel temps de main-d'œuvre prévoyez-vous ?");

    const rank = (title: string) => (SECTION_ORDER.includes(title) ? SECTION_ORDER.indexOf(title) : SECTION_ORDER.length);
    const ordered = [...sections.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
    const firstSentence = text
      .trim()
      .split(/[.!?\n]/)[0]
      .trim();
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
        ...detected.flatMap((c) => LIBRARY[c].checks),
      ],
      warnings,
      explanations,
      trades: detected.map((c) => ({ code: c, label: LIBRARY[c].label })),
      detected: measures,
    };
  },
};

export function getAssistantProvider(): AssistantProvider {
  return localProvider;
}

const inputSchema = z.object({
  text: z.string().trim().min(10, "Décrivez le chantier en quelques phrases").max(4000),
  quoteId: z.string().uuid().optional(),
});

/**
 * Reprend les habitudes de l'entreprise : libellé et position préférés, et prix
 * habituel pour une ligne qui ne vient pas du catalogue (le catalogue reste la
 * référence de prix). Retourne la clé d'origine de chaque ligne.
 */
export function applyHabits(p: AssistantProposal, habits: Map<string, Habit>) {
  const sourceKeys = new Map<string, string>();
  let applied = 0;
  for (const s of p.sections) {
    const original = new Map(s.lines.map((l, i) => [l.id, i]));
    for (const l of s.lines) {
      const key = habitKey(l.label);
      sourceKeys.set(l.id, key);
      const h = habits.get(key);
      if (!h || l.kind === "note") continue;
      const changes: string[] = [];
      if (h.label && h.label !== l.label) {
        l.label = h.label;
        changes.push("libellé");
      }
      if (!l.catalogItemId && h.unitPrice && h.unit === l.unit && !samePrice(h.unitPrice, l.unitPrice)) {
        l.unitPrice = h.unitPrice;
        l.estimateNote = l.estimateNote.replace(/prix indicatif de la bibliothèque \([^)]*\), absent de votre catalogue/, "prix de vos devis précédents");
        changes.push("prix");
      }
      if (changes.length) {
        applied++;
        p.explanations[l.id] = `${p.explanations[l.id] ?? ""} ${changes.join(" et ")} repris de vos devis précédents.`.trim();
      }
    }
    const rank = (id: string, label: string) => habits.get(habitKey(label))?.position ?? original.get(id)!;
    s.lines.sort((a, b) => rank(a.id, a.label) - rank(b.id, b.label) || original.get(a.id)! - original.get(b.id)!);
  }
  return { applied, sourceKeys };
}

/** Lignes que l'artisan a ajoutées au devis depuis une proposition. */
export async function markProposalAdded(ctx: Ctx, proposalId: string, raw: unknown) {
  requireWritable(ctx);
  const parsed = z.object({ quoteId: z.string().uuid(), lineIds: z.array(z.string().max(64)).max(500) }).safeParse(raw);
  if (!parsed.success) throw badRequest("Lignes ajoutées invalides");
  const r = await ctx.db.query(
    "UPDATE assistant_proposals SET added_at=now(), quote_id=$3, added_line_ids=$4 WHERE id=$1 AND org_id=$2 AND measured_at IS NULL RETURNING id",
    [proposalId, ctx.orgId, parsed.data.quoteId, JSON.stringify(parsed.data.lineIds)],
  );
  if (!r.length) throw notFound("Proposition introuvable");
}

/** Limite les données personnelles transmises : adresses e-mail et numéros de téléphone sont masqués. */
export function minimizePersonalData(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]").replace(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g, "[téléphone]");
}

export async function proposeDraft(ctx: Ctx, raw: unknown): Promise<AssistantProposal> {
  requireWritable(ctx);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  await hitRate(ctx.db, "assistant.burst", ctx.orgId);
  await assertAiQuota(ctx.db, ctx);
  const provider = getAssistantProvider();
  const catalog = await searchItems(ctx, { limit: 2000 });
  const org = await ctx.db.query<{ trade: string }>("SELECT trade FROM organizations WHERE id=$1", [ctx.orgId]);
  const result = await provider.propose({ text: minimizePersonalData(parsed.data.text), catalog, profession: org[0]?.trade ?? "" });
  const { applied, sourceKeys } = applyHabits(result, await loadHabits(ctx.db, ctx.orgId));
  const lines: ProposedLine[] = result.sections.flatMap((s) =>
    s.lines.map((l) => ({ id: l.id, sourceKey: sourceKeys.get(l.id) ?? habitKey(l.label), label: l.label, unit: l.unit, unitPrice: l.unitPrice })),
  );
  const saved = await ctx.db.query<{ id: string }>("INSERT INTO assistant_proposals (org_id, quote_id, lines) VALUES ($1,$2,$3) RETURNING id", [
    ctx.orgId,
    parsed.data.quoteId ?? null,
    JSON.stringify(lines),
  ]);
  const quality = await assistantQuality(ctx.db, ctx.orgId);
  result.proposalId = saved[0].id;
  result.followUps = followUps(parsed.data.text, result);
  const covered = new Set(result.followUps.length ? REPLACED_QUESTIONS : []);
  result.questions = result.questions.filter((q) => !covered.has(q));
  result.habitsApplied = applied;
  result.quality = { lines: quality.lines, keptPercent: quality.keptPercent };
  // Coût mesuré par compte : nul pour le moteur local, à renseigner pour un fournisseur externe.
  await recordUsage(ctx.db, ctx.orgId, ctx.userId, "ai", 1, provider.name === "local" ? 0 : 2000);
  return result;
}
