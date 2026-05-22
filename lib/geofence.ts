import type { LatLng } from "./types";

// NoMans Land Brewing Co., Oak Bluffs, MA.
// Update with the exact coordinate if surveyed on-site.
export const NOMANS: LatLng = { lat: 41.4541, lng: -70.5605 };

// Oak Bluffs operating bounding box. Pings outside this box are rejected and
// the user is told to walk to the nearest in-zone corner. Loose enough to
// cover the ferry terminal, Circuit Ave, Ocean Park, and the inkwell.
const BOUNDS = {
  south: 41.4380,
  north: 41.4720,
  west: -70.5780,
  east: -70.5460,
};

export function inOakBluffs({ lat, lng }: LatLng): boolean {
  return lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;
}

// Haversine distance in miles. Cheap enough for a handful of stops.
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
