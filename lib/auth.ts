import { getDrivers } from "./store";
import type { Driver } from "./types";

// Admin gate. ADMIN_PASSCODE must be set in env. There is no way to
// rotate it from the UI by design — that env var is the bootstrap
// out of "lost everything" situations.
export function isAdmin(passcode: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || !passcode) return false;
  return safeEquals(String(passcode), expected);
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

// Length-leaking but content-safe equality. Good enough for short
// shared-secret comparison; full timing safety would require Buffer +
// crypto.timingSafeEqual which is overkill at this scale.
function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
