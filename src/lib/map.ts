/**
 * Carte des chantiers et des clients, dessinée sans service de tuiles : projection des positions
 * dans un cadre, et répartition par distance au dépôt pour juger de la zone d'intervention.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Projette les points dans un cadre de largeur × hauteur avec une marge, en gardant les proportions
 * (un degré de longitude est raccourci par le cosinus de la latitude moyenne).
 */
export function project(points: GeoPoint[], width: number, height: number, margin = 24): { x: number; y: number }[] {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const minX = Math.min(...lngs) * k;
  const maxX = Math.max(...lngs) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  // Un seul lieu, ou des lieux confondus : une fenêtre d'environ 2 km autour.
  const spanX = Math.max(maxX - minX, 0.02);
  const spanY = Math.max(maxY - minY, 0.02);
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const offX = (width - spanX * scale) / 2 - (minX - (spanX - (maxX - minX)) / 2) * scale;
  const offY = (height - spanY * scale) / 2 + (maxY + (spanY - (maxY - minY)) / 2) * scale;
  return points.map((p) => ({ x: Math.round((p.lng * k * scale + offX) * 10) / 10, y: Math.round((offY - p.lat * scale) * 10) / 10 }));
}

export const DISTANCE_BANDS = [
  { max: 10, label: "Moins de 10 km" },
  { max: 30, label: "10 à 30 km" },
  { max: 50, label: "30 à 50 km" },
  { max: Infinity, label: "Plus de 50 km" },
] as const;

/** Nombre de lieux par tranche de distance au dépôt. */
export function distanceBands(depot: GeoPoint, points: GeoPoint[]): number[] {
  const counts = DISTANCE_BANDS.map(() => 0);
  for (const p of points) counts[DISTANCE_BANDS.findIndex((b) => distanceKm(depot, p) < b.max)]++;
  return counts;
}

export function osmUrl(p: GeoPoint): string {
  return `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&mlon=${p.lng.toFixed(5)}#map=15/${p.lat.toFixed(5)}/${p.lng.toFixed(5)}`;
}
