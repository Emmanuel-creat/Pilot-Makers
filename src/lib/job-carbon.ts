/**
 * Bilan carbone d'un chantier : produits posés, déplacements et déchets évacués, avec les leviers pour le réduire.
 * Fonctions pures, en grammes d'équivalent CO2.
 *
 * Les facteurs sont des ordres de grandeur indicatifs (base Empreinte de l'ADEME pour les véhicules, estimations
 * prudentes pour le traitement des déchets) : ils servent à comparer et à réduire, pas à déclarer.
 */

import { categoryByKey, type WasteClass } from "./waste";

export const VEHICLES = {
  utilitaire_diesel: { label: "Utilitaire diesel", gramsPerKm: 270 },
  utilitaire_electrique: { label: "Utilitaire électrique", gramsPerKm: 60 },
  voiture_diesel: { label: "Voiture diesel", gramsPerKm: 200 },
  voiture_electrique: { label: "Voiture électrique", gramsPerKm: 40 },
  aucun: { label: "Sans véhicule (à pied, à vélo)", gramsPerKm: 0 },
} as const;
export type Vehicle = keyof typeof VEHICLES;
export const vehicleOf = (v: string): Vehicle => (v in VEHICLES ? (v as Vehicle) : "utilitaire_diesel");

/** Grammes de CO2e par tonne évacuée, selon la classe et le tri */
export const WASTE_GRAMS_PER_TONNE: Record<WasteClass, { sorted: number; mixed: number }> = {
  inerte: { sorted: 5_000, mixed: 10_000 },
  non_dangereux: { sorted: 40_000, mixed: 200_000 },
  dangereux: { sorted: 500_000, mixed: 500_000 },
};

export interface WasteLine {
  category: string;
  tonnes: number | null;
  sorted: boolean;
}

export interface JobCarbonInput {
  materialsGrams: number;
  /** Part des produits dont l'empreinte vient d'un ordre de grandeur plutôt que du catalogue */
  materialsEstimatedGrams: number;
  tripKm: number | null;
  trips: number;
  vehicle: Vehicle;
  waste: WasteLine[];
}

export interface Lever {
  key: string;
  label: string;
  savingGrams: number;
}

export function wasteGrams(w: WasteLine) {
  const cls = categoryByKey(w.category)?.cls ?? "non_dangereux";
  const f = WASTE_GRAMS_PER_TONNE[cls];
  return Math.round((w.tonnes ?? 0) * (w.sorted ? f.sorted : f.mixed));
}

export function jobCarbon(i: JobCarbonInput) {
  const travelGrams = Math.round((i.tripKm ?? 0) * i.trips * VEHICLES[i.vehicle].gramsPerKm);
  const waste = i.waste.reduce((s, w) => s + wasteGrams(w), 0);
  const total = i.materialsGrams + travelGrams + waste;
  const share = (g: number) => (total ? Math.round((g / total) * 100) : 0);
  const levers: Lever[] = [];
  if (i.tripKm && i.trips > 1 && i.vehicle !== "aucun") {
    const perTrip = Math.round(i.tripKm * VEHICLES[i.vehicle].gramsPerKm);
    const fewer = Math.max(1, Math.round(i.trips * 0.2));
    levers.push({ key: "trajets", label: `Regrouper les interventions pour faire ${fewer} aller-retour de moins`, savingGrams: perTrip * fewer });
  }
  if (i.tripKm && i.vehicle.endsWith("diesel")) {
    const electric = i.vehicle === "utilitaire_diesel" ? "utilitaire_electrique" : "voiture_electrique";
    levers.push({
      key: "vehicule",
      label: `Passer à un véhicule électrique (${VEHICLES[electric].label.toLowerCase()})`,
      savingGrams: Math.round(i.tripKm * i.trips * (VEHICLES[i.vehicle].gramsPerKm - VEHICLES[electric].gramsPerKm)),
    });
  }
  const unsorted = i.waste.filter((w) => !w.sorted && w.tonnes);
  if (unsorted.length) {
    const saving = unsorted.reduce((s, w) => s + wasteGrams(w) - wasteGrams({ ...w, sorted: true }), 0);
    if (saving > 0) levers.push({ key: "tri", label: "Trier les déchets sur le chantier pour qu'ils soient valorisés", savingGrams: saving });
  }
  if (i.materialsGrams > 0) {
    levers.push({
      key: "biosource",
      label: "Choisir des produits biosourcés ou de réemploi pour les postes les plus lourds",
      savingGrams: Math.round(i.materialsGrams * 0.2),
    });
  }
  return {
    totalGrams: total,
    materials: { grams: i.materialsGrams, share: share(i.materialsGrams), estimatedGrams: i.materialsEstimatedGrams },
    travel: { grams: travelGrams, share: share(travelGrams), km: (i.tripKm ?? 0) * i.trips },
    waste: { grams: waste, share: share(waste), unknownVolume: i.waste.some((w) => w.tonnes == null) },
    levers: levers.filter((l) => l.savingGrams > 0).sort((a, b) => b.savingGrams - a.savingGrams),
  };
}

/** Équivalence parlante : kilomètres parcourus en voiture thermique moyenne (environ 200 g par km) */
export const carKmEquivalent = (grams: number) => Math.round(grams / 200);
