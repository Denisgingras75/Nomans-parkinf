import type { BBox, LatLng } from "./types";

// Defaults used to seed Settings on first install. After that, the
// admin can edit these from /admin and the values move into KV.
export const DEFAULT_NOMANS: LatLng = { lat: 41.4541, lng: -70.5605 };
export const DEFAULT_BOUNDS: BBox = {
  south: 41.438,
  north: 41.472,
  west: -70.578,
  east: -70.546,
};

export function inBounds(p: LatLng, b: BBox): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

// Haversine distance in miles.
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Crude ETA: assume 18 mph average through Oak Bluffs in season.
export function etaMinutes(from: LatLng, to: LatLng, avgMph = 18): number {
  return Math.max(1, Math.round((distanceMiles(from, to) / avgMph) * 60));
}
