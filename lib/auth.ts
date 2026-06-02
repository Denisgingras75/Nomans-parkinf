import { getDrivers, getManagers } from "./store";
import type { Driver } from "./types";

// Bootstrap admin = the ADMIN_PASSCODE env var. Only this auth can
// see, add, or revoke other managers (and can never be rotated from
// the UI by design — env-only escape hatch).
export function isBootstrap(passcode: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || !passcode) return false;
  return safeEquals(String(passcode), expected);
}

// Any admin — bootstrap (Denis) OR a manager added in /admin (staff).
// Used by all /api/admin/* endpoints except manager mgmt itself.
export async function isAdmin(passcode: string | null | undefined): Promise<boolean> {
  if (isBootstrap(passcode)) return true;
  if (!passcode) return false;
  const p = String(passcode);
  const managers = await getManagers();
  for (const m of managers) {
    if (safeEquals(p, m.passcode)) return true;
  }
  return false;
}

// Driver gate. Checks the dynamic drivers list managed by admin, then
// falls back to the legacy DRIVER_PASSCODE env var so existing deploys
// keep working until the owner provisions per-driver codes.
export async function findDriver(
  passcode: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!passcode) return null;
  const p = String(passcode);
  const legacy = process.env.DRIVER_PASSCODE;
  if (legacy && safeEquals(p, legacy)) return { id: "legacy", name: "Driver" };
  const drivers = await getDrivers();
  for (const d of drivers) {
    if (safeEquals(p, d.passcode)) return { id: d.id, name: d.name };
  }
  return null;
}

// Same as findDriver but returns the full Driver record. Legacy
// DRIVER_PASSCODE returns null here — there's no row to update for the
// skeleton-key code, so endpoints that need to write a driver (e.g.
// shift toggle) reject legacy auth.
export async function findFullDriver(
  passcode: string | null | undefined,
): Promise<Driver | null> {
  if (!passcode) return null;
  const p = String(passcode);
  const drivers = await getDrivers();
  for (const d of drivers) {
    if (safeEquals(p, d.passcode)) return d;
  }
  return null;
}

// A "van" operating identity. On the shared DRIVER_PASSCODE two phones are
// otherwise indistinguishable to the server; selecting a van at sign-in makes
// them distinct (Van 1 vs Van 2) for dispatch priority, ride ownership, and
// map position.
export function normalizeVan(van: string | null | undefined): "van1" | "van2" | null {
  if (van === "1" || van === "van1") return "van1";
  if (van === "2" || van === "van2") return "van2";
  return null;
}

export function vanName(id: string): string {
  return id === "van1" ? "Van 1" : id === "van2" ? "Van 2" : id;
}

// Resolve the operating identity for a driver request. The passcode is the
// gate (shared DRIVER_PASSCODE or a real per-driver NM code). When a van is
// selected, the van IS the identity; otherwise it's the resolved driver. Null
// means the passcode itself didn't validate.
export async function resolveOperator(
  passcode: string | null | undefined,
  van: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  const base = await findDriver(passcode);
  if (!base) return null;
  const v = normalizeVan(van);
  return v ? { id: v, name: vanName(v) } : base;
}

// Length-leaking but content-safe equality. Good enough for short
// shared-secret comparison; full timing safety would require Buffer +
// crypto.timingSafeEqual which is overkill at this scale.
function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
