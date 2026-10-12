/**
 * Habitudes de l'entreprise et mesure de qualité de l'assistant de préparation.
 *
 * Chaque proposition est conservée (libellé, unité, prix de chaque ligne). Quand
 * le devis est émis, on compare les lignes ajoutées à ce qui a été émis :
 * gardée telle quelle, modifiée ou retirée. Les libellés, prix et positions
 * réellement émis deviennent des habitudes, reprises dans les propositions suivantes.
 */

import { parseScaled } from "@/lib/calc/decimal";
import type { Queryable } from "@/lib/db";
import { num } from "@/lib/db";
import type { DraftSection } from "./quote-types";

export interface ProposedLine {
  id: string;
  /** Libellé d'origine (bibliothèque ou catalogue), clé de l'habitude */
  sourceKey: string;
  label: string;
  unit: string;
  unitPrice: string;
}

export interface Habit {
  label: string;
  unit: string;
  unitPrice: string;
  position: number;
  uses: number;
}

export const habitKey = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9²]+/g, " ")
    .trim();

/** Deux prix saisis sont égaux s'ils valent le même montant ("45" et "45,00"). */
export function samePrice(a: string, b: string) {
  try {
    return parseScaled(a || "0", 4) === parseScaled(b || "0", 4);
  } catch {
    return a.trim() === b.trim();
  }
}

/** Lignes émises, par identifiant, avec leur position dans la section. */
function issuedLines(sections: DraftSection[]) {
  const map = new Map<string, { label: string; unit: string; unitPrice: string; position: number }>();
  for (const s of sections) s.lines.forEach((l, i) => map.set(l.id, { label: l.label, unit: l.unit, unitPrice: l.unitPrice, position: i }));
  return map;
}

/** Classe chaque ligne ajoutée : gardée telle quelle, modifiée ou retirée. */
export function compareProposal(proposed: ProposedLine[], added: string[], sections: DraftSection[]) {
  const issued = issuedLines(sections);
  const result = {
    kept: 0,
    edited: 0,
    removed: 0,
    learned: [] as { sourceKey: string; label: string; unit: string; unitPrice: string; position: number }[],
  };
  for (const p of proposed) {
    if (!added.includes(p.id)) continue;
    const l = issued.get(p.id);
    if (!l) {
      result.removed++;
      continue;
    }
    const same = l.label.trim() === p.label.trim() && l.unit === p.unit && samePrice(l.unitPrice, p.unitPrice);
    if (same) result.kept++;
    else result.edited++;
    result.learned.push({ sourceKey: p.sourceKey, label: l.label.trim(), unit: l.unit, unitPrice: l.unitPrice, position: l.position });
  }
  return result;
}

export async function loadHabits(db: Queryable, orgId: string) {
  const rows = await db.query<Record<string, unknown>>("SELECT * FROM assistant_habits WHERE org_id=$1", [orgId]);
  return new Map<string, Habit>(
    rows.map((r) => [
      String(r.source_key),
      { label: String(r.label), unit: String(r.unit), unitPrice: String(r.unit_price), position: Number(r.position), uses: num(r.uses) },
    ]),
  );
}

/** Mesure les propositions ajoutées à ce devis et retient les habitudes, à l'émission. */
export async function measureProposals(db: Queryable, orgId: string, quoteId: string, sections: DraftSection[]) {
  const rows = await db.query<{ id: string; lines: ProposedLine[]; added_line_ids: string[] | null }>(
    "SELECT id, lines, added_line_ids FROM assistant_proposals WHERE org_id=$1 AND quote_id=$2 AND added_at IS NOT NULL AND measured_at IS NULL",
    [orgId, quoteId],
  );
  for (const r of rows) {
    const c = compareProposal(r.lines, r.added_line_ids ?? [], sections);
    await db.query("UPDATE assistant_proposals SET measured_at=now(), kept=$2, edited=$3, removed=$4 WHERE id=$1", [
      r.id,
      c.kept,
      c.edited,
      c.removed,
    ]);
    for (const h of c.learned) {
      // Position : moyenne glissante des places où l'entreprise met cette ligne.
      await db.query(
        `INSERT INTO assistant_habits (org_id, source_key, label, unit, unit_price, position, uses) VALUES ($1,$2,$3,$4,$5,$6,1)
         ON CONFLICT (org_id, source_key) DO UPDATE SET label=EXCLUDED.label, unit=EXCLUDED.unit, unit_price=EXCLUDED.unit_price,
           position=(assistant_habits.position * assistant_habits.uses + EXCLUDED.position) / (assistant_habits.uses + 1),
           uses=assistant_habits.uses + 1, updated_at=now()`,
        [orgId, h.sourceKey, h.label.slice(0, 300), h.unit.slice(0, 20), h.unitPrice.slice(0, 30), h.position],
      );
    }
  }
  return rows.length;
}

/** Part des lignes proposées puis ajoutées qui ont été émises sans modification. */
export async function assistantQuality(db: Queryable, orgId: string) {
  const r = (
    await db.query<Record<string, unknown>>(
      "SELECT coalesce(sum(kept),0) AS kept, coalesce(sum(edited),0) AS edited, coalesce(sum(removed),0) AS removed FROM assistant_proposals WHERE org_id=$1 AND measured_at IS NOT NULL",
      [orgId],
    )
  )[0];
  const kept = num(r?.kept);
  const edited = num(r?.edited);
  const removed = num(r?.removed);
  const lines = kept + edited + removed;
  return { lines, kept, edited, removed, keptPercent: lines ? Math.round((kept * 100) / lines) : null };
}
