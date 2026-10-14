/**
 * Métré sur plan : à partir d'une cote connue (étalonnage), longueurs, surfaces, surfaces de murs et
 * comptages relevés en cliquant sur l'image du plan, convertis en quantités de devis.
 */

import { z } from "zod";

export interface Pt {
  x: number;
  y: number;
}

export const TAKEOFF_KINDS = {
  longueur: { label: "Longueur", unit: "ml", min: 2 },
  surface: { label: "Surface", unit: "m²", min: 3 },
  mur: { label: "Surface de mur", unit: "m²", min: 2 },
  nombre: { label: "Comptage", unit: "u", min: 1 },
} as const;
export type TakeoffKind = keyof typeof TAKEOFF_KINDS;

export interface Measurement {
  id: string;
  kind: TakeoffKind;
  label: string;
  points: Pt[];
  /** Hauteur des murs en mètres (surface de mur) */
  height?: number;
  /** Surface à déduire en m² (ouvertures) */
  deduct?: number;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(points: Pt[], closed = false): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  if (closed && points.length > 2) s += dist(points[points.length - 1], points[0]);
  return s;
}

/** Aire d'un polygone (formule du lacet), en unités de l'image au carré. */
export function polygonArea(points: Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Pixels par mètre d'après deux points et la longueur réelle qui les sépare. */
export function scaleFrom(a: Pt, b: Pt, meters: number): number | null {
  const d = dist(a, b);
  return d > 0 && meters > 0 ? d / meters : null;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Quantité d'un relevé à l'échelle donnée ; null si le relevé est incomplet ou l'échelle inconnue. */
export function quantity(m: Measurement, pxPerM: number | null): number | null {
  if (m.points.length < TAKEOFF_KINDS[m.kind].min) return null;
  if (m.kind === "nombre") return m.points.length;
  if (!pxPerM || pxPerM <= 0) return null;
  if (m.kind === "longueur") return round(pathLength(m.points) / pxPerM, 2);
  if (m.kind === "surface") return round(Math.max(0, polygonArea(m.points) / pxPerM ** 2 - (m.deduct ?? 0)), 2);
  const h = m.height ?? 0;
  if (h <= 0) return null;
  return round(Math.max(0, (pathLength(m.points) / pxPerM) * h - (m.deduct ?? 0)), 2);
}

const pt = z.object({ x: z.number().finite().min(-1e5).max(1e5), y: z.number().finite().min(-1e5).max(1e5) });
export const measurementSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(Object.keys(TAKEOFF_KINDS) as [TakeoffKind, ...TakeoffKind[]]),
  label: z.string().trim().max(200).default(""),
  points: z.array(pt).max(400),
  height: z.number().finite().min(0).max(100).optional(),
  deduct: z.number().finite().min(0).max(100_000).optional(),
});
export const takeoffSchema = z.object({
  pxPerM: z.number().finite().positive().max(1e6).nullable(),
  measurements: z.array(measurementSchema).max(200),
});

/** Texte de quantité au format des lignes de devis (virgule décimale). */
export const quantityText = (v: number) => String(v).replace(".", ",");
