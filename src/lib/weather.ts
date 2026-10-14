/**
 * Météo des travaux extérieurs : prévisions quotidiennes, seuils par type de travaux
 * et proposition de décalage du chantier vers la première période favorable.
 */

import { workingDaysFrom } from "@/lib/auto-planning";

export interface DayForecast {
  date: string;
  tMin: number;
  tMax: number;
  /** Cumul de pluie en mm */
  rainMm: number;
  /** Probabilité de pluie maximale en % */
  rainProb: number;
  /** Rafales maximales en km/h */
  gustKmh: number;
}

export const OUTDOOR_WORKS = {
  general: { label: "Travaux extérieurs", rainMm: 5, rainProb: 80, gustKmh: 70, minTemp: -5 },
  maconnerie: { label: "Maçonnerie, béton, enduits", rainMm: 2, rainProb: 70, gustKmh: 70, minTemp: 2 },
  toiture: { label: "Toiture, couverture, travail en hauteur", rainMm: 1, rainProb: 60, gustKmh: 50, minTemp: -5 },
  peinture: { label: "Peinture et ravalement de façade", rainMm: 0.5, rainProb: 50, gustKmh: 60, minTemp: 5 },
  terrassement: { label: "Terrassement, VRD, espaces verts", rainMm: 10, rainProb: 90, gustKmh: 80, minTemp: -5 },
} as const;
export type OutdoorWork = keyof typeof OUTDOOR_WORKS;

export function isOutdoorWork(v: string): v is OutdoorWork {
  return v in OUTDOOR_WORKS;
}

/** Raisons pour lesquelles la journée est défavorable à ce type de travaux ; vide si elle convient. */
export function dayRisks(f: DayForecast, kind: OutdoorWork): string[] {
  const t = OUTDOOR_WORKS[kind];
  const out: string[] = [];
  if (f.rainMm >= t.rainMm || f.rainProb >= t.rainProb) out.push(`pluie ${fmt(f.rainMm)} mm (${Math.round(f.rainProb)} %)`);
  if (f.gustKmh >= t.gustKmh) out.push(`rafales ${Math.round(f.gustKmh)} km/h`);
  if (f.tMin < t.minTemp) out.push(`${fmt(f.tMin)} °C au plus froid`);
  return out;
}

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export interface WeatherCheck {
  /** Jours planifiés couverts par la prévision, avec leurs risques */
  days: { date: string; risks: string[]; forecast: DayForecast | null }[];
  risky: number;
  /** Première période favorable de même durée, ou null s'il n'y en a pas dans l'horizon de prévision */
  proposal: { start: string; days: string[]; shift: number } | null;
}

const dayNum = (s: string) => Math.round(Date.parse(`${s}T12:00:00Z`) / 86_400_000);

/** Contrôle les jours planifiés d'un chantier et propose un décalage s'ils tombent mal. */
export function checkJob(planned: string[], forecast: DayForecast[], kind: OutdoorWork, today: string): WeatherCheck {
  const byDate = new Map(forecast.map((f) => [f.date, f]));
  const upcoming = [...new Set(planned)].filter((d) => d >= today).sort();
  const days = upcoming.map((date) => {
    const f = byDate.get(date) ?? null;
    return { date, forecast: f, risks: f ? dayRisks(f, kind) : [] };
  });
  const risky = days.filter((d) => d.risks.length).length;
  let proposal: WeatherCheck["proposal"] = null;
  if (risky && upcoming.length) {
    const last = forecast.length ? forecast[forecast.length - 1].date : today;
    const n = upcoming.length;
    for (let i = 0; i < 30; i++) {
      const start = workingDaysFrom(today, i + 1)[i];
      const span = workingDaysFrom(start, n);
      if (span[span.length - 1] > last) break;
      if (span.every((d) => byDate.has(d) && !dayRisks(byDate.get(d)!, kind).length)) {
        if (start !== upcoming[0]) proposal = { start, days: span, shift: dayNum(start) - dayNum(upcoming[0]) };
        break;
      }
    }
  }
  return { days, risky, proposal };
}

/** Lit la réponse quotidienne d'Open-Meteo. */
export function parseOpenMeteo(j: unknown): DayForecast[] {
  const d = (j as { daily?: Record<string, unknown[]> })?.daily;
  if (!d || !Array.isArray(d.time)) return [];
  const n = (k: string, i: number) => {
    const v = Number((d[k] as unknown[] | undefined)?.[i]);
    return Number.isFinite(v) ? v : 0;
  };
  return d.time
    .map((t, i) => ({
      date: String(t).slice(0, 10),
      tMin: n("temperature_2m_min", i),
      tMax: n("temperature_2m_max", i),
      rainMm: n("precipitation_sum", i),
      rainProb: n("precipitation_probability_max", i),
      gustKmh: n("wind_gusts_10m_max", i),
    }))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date));
}

/** Prévision de démonstration, stable pour une date donnée (un jour sur trois pluvieux). */
export function demoForecast(today: string, count = 10): DayForecast[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    const k = dayNum(date);
    const wet = k % 3 === 0;
    return { date, tMin: 6 + (k % 5), tMax: 14 + (k % 7), rainMm: wet ? 8 : 0, rainProb: wet ? 85 : 10, gustKmh: 25 + (k % 4) * 10 };
  });
}
