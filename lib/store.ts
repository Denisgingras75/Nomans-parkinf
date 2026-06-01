import type { AppState, Driver, LatLng, Manager, Settings, ShuttleState, Stop, StopStatus } from "./types";
import { DEFAULT_BOUNDS, DEFAULT_NOMANS } from "./geofence";
import { DEFAULT_HOURS } from "./schedule";

// Persistence layer. KV-backed when KV_REST_API_URL/TOKEN env vars are
// present (added automatically by the Upstash Redis Vercel integration);
// otherwise falls back to a module-scoped in-memory map. Same public API
// either way — routes just await it.
//
// Three keyed namespaces in KV:
//   nomans:state:v1     — live shuttle position + active queue
//   nomans:settings:v1  — admin-editable NoMans pin, bounds, capacity, online
//   nomans:drivers:v1   — driver records with their per-driver passcodes
//
// We do read-modify-write on each mutation. Concurrent writes are rare
// (one shuttle, occasional pings), but if traffic grew we'd switch to
// per-field Redis ops or a CAS loop.

const KV_STATE_KEY = "nomans:state:v1";
const KV_SETTINGS_KEY = "nomans:settings:v1";
const KV_DRIVERS_KEY = "nomans:drivers:v1";
const KV_MANAGERS_KEY = "nomans:managers:v1";
const KV_PUSH_SUBS_KEY = "nomans:push-subs:v1";
const KV_RIDES_PREFIX = "nomans:rides:"; // suffix: YYYY-MM-DD (Eastern)
const KV_BOUNCIE_DEBUG_KEY = "nomans:bouncie-debug:v1"; // TEMP — remove after parser confirmed

// Resolve the Upstash REST credentials from EITHER naming convention:
//   - KV_REST_API_URL / KV_REST_API_TOKEN     (legacy "Vercel KV" integration)
//   - UPSTASH_REDIS_REST_URL / ..._TOKEN      (current Upstash Marketplace one)
// The newer Marketplace integration often injects only the UPSTASH_* names, so
// reading just the KV_* ones silently dropped us to memory-only — fatal on
// serverless, where the webhook and the page-poll land on different instances.
function kvCreds(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

// Always attempt KV first. The helpers below fall back to in-memory when no
// credentials are present so `npm run dev` without KV still works.
function useKV(): boolean {
  return kvCreds() != null;
}

// Public flag so /admin can warn the owner when persistence is OFF (memory
// only) — the state most likely to make live GPS silently never appear.
export function isKvConfigured(): boolean {
  return useKV();
}

const memory = globalThis as unknown as {
  __nomansState?: AppState;
  __nomansSettings?: Settings;
  __nomansDrivers?: Driver[];
  __nomansManagers?: Manager[];
  __nomansRides?: Record<string, Stop[]>;
  __nomansPushSubs?: StoredPushSub[];
  __nomansBouncieDebug?: BouncieDebugEntry[];
};

export type StoredPushSub = {
  driverId: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
  createdAt: number;
};

const DEFAULT_SETTINGS: Settings = {
  nomans: DEFAULT_NOMANS,
  bounds: DEFAULT_BOUNDS,
  capacity: 8,
  online: true,
  alertsEnabled: true,
  hours: DEFAULT_HOURS,
  vehicleLabels: {},
};

function initState(): AppState {
  return {
    shuttles: [],
    capacity: DEFAULT_SETTINGS.capacity,
    onboard: 0,
    stops: [],
  };
}

// A van that hasn't reported in this long drops out of the public feed so a
// parked/off van doesn't linger on the map.
export const SHUTTLE_STALE_MS = 10 * 60 * 1000;

// Heal the pre-two-shuttle KV shape ({ shuttle } singular, with capacity +
// onboard living on the shuttle) into the keyed-by-id { shuttles } shape.
// Mirrors the legacy-healing already done in kvGet.
function migrateState(raw: any): AppState {
  if (!raw || typeof raw !== "object") return initState();
  if (Array.isArray(raw.shuttles)) {
    // Already migrated; backfill the fleet pool if an older partial lacks it.
    return {
      shuttles: raw.shuttles,
      capacity: typeof raw.capacity === "number" ? raw.capacity : DEFAULT_SETTINGS.capacity,
      onboard: typeof raw.onboard === "number" ? raw.onboard : 0,
      stops: Array.isArray(raw.stops) ? raw.stops : [],
    };
  }
  const old = raw.shuttle;
  return {
    shuttles: old
      ? [
          {
            id: "legacy",
            position: old.position ?? null,
            heading: old.heading ?? null,
            speedMph: old.speedMph ?? null,
            updatedAt: old.updatedAt ?? null,
          },
        ]
      : [],
    capacity: typeof old?.capacity === "number" ? old.capacity : DEFAULT_SETTINGS.capacity,
    onboard: typeof old?.onboard === "number" ? old.onboard : 0,
    stops: Array.isArray(raw.stops) ? raw.stops : [],
  };
}

// Direct Upstash REST calls. Avoids @vercel/kv's import-time client
// initialization which was causing cold-start instances to read env
// vars before Vercel had fully injected them.
async function kvGet<T>(key: string): Promise<T | null> {
  const creds = kvCreds();
  if (!creds) return null;
  const { url, token } = creds;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: string | null };
  if (json.result == null) return null;
  try {
    const first = JSON.parse(json.result);
    // Heal legacy double-encoded writes (string of JSON inside a string)
    if (typeof first === "string") {
      try {
        return JSON.parse(first) as T;
      } catch {
        return null;
      }
    }
    return first as T;
  } catch {
    return null;
  }
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  const creds = kvCreds();
  if (!creds) return;
  const { url, token } = creds;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(value),
    cache: "no-store",
  });
}

// ---------- State (shuttle position + active queue) ----------

async function readState(): Promise<AppState> {
  if (useKV()) return migrateState(await kvGet<any>(KV_STATE_KEY));
  if (!memory.__nomansState) memory.__nomansState = initState();
  return migrateState(memory.__nomansState);
}

async function writeState(state: AppState): Promise<void> {
  if (useKV()) await kvSet(KV_STATE_KEY, state);
  else memory.__nomansState = state;
}

export async function getState(): Promise<AppState> {
  return readState();
}

// Upsert a single vehicle's telemetry by id. Two vans on one Bouncie account
// land as two entries instead of clobbering each other.
export async function upsertShuttle(
  id: string,
  patch: Partial<Omit<ShuttleState, "id">>,
): Promise<void> {
  const state = await readState();
  const existing = state.shuttles.find((s) => s.id === id);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    state.shuttles.push({
      id,
      position: null,
      heading: null,
      speedMph: null,
      updatedAt: null,
      ...patch,
    });
  }
  await writeState(state);
}

export async function addStop(
  input: Omit<Stop, "id" | "status" | "createdAt" | "updatedAt">,
): Promise<Stop> {
  const state = await readState();
  const now = Date.now();
  const stop: Stop = {
    ...input,
    id: cryptoRandomId(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  state.stops.push(stop);
  await writeState(state);
  return stop;
}

export async function setStopStatus(id: string, status: StopStatus): Promise<Stop | null> {
  const state = await readState();
  const stop = state.stops.find((s) => s.id === id);
  if (!stop) return null;
  stop.status = status;
  stop.updatedAt = Date.now();
  if (status === "picked-up" && stop.kind === "pickup") {
    state.onboard = Math.min(state.capacity, state.onboard + stop.partySize);
  }
  if (status === "dropped-off") {
    state.onboard = Math.max(0, state.onboard - stop.partySize);
  }
  await writeState(state);
  if (status === "picked-up" || status === "dropped-off" || status === "cancelled") {
    await appendToRideArchive(stop);
  }
  return stop;
}

// Passenger self-cancel. Given a stop id the passenger holds (the random id
// returned from /api/ping acts as their capability token), cancel every still-
// active leg of that ride — both the pickup and the dropoff. Returns the
// cancelled stops, [] if the ride is already past cancelling (picked-up or
// terminal), or null if the id is unknown.
export async function cancelRide(stopId: string): Promise<Stop[] | null> {
  const state = await readState();
  const target = state.stops.find((s) => s.id === stopId);
  if (!target) return null;
  // Once a leg is picked up (or already terminal) it's too late to self-cancel
  // — the driver is mid-ride. They wave the driver off in person from here.
  if (target.status !== "queued" && target.status !== "enroute") return [];

  const now = Date.now();
  // Match the whole ride by rideId; fall back to the single stop for legacy
  // pings written before rideId existed.
  const inRide = (s: Stop) =>
    target.rideId ? s.rideId === target.rideId : s.id === target.id;

  const cancelled: Stop[] = [];
  for (const s of state.stops) {
    if (inRide(s) && (s.status === "queued" || s.status === "enroute")) {
      s.status = "cancelled";
      s.updatedAt = now;
      cancelled.push(s);
    }
  }
  if (cancelled.length) {
    await writeState(state);
    for (const s of cancelled) await appendToRideArchive(s);
  }
  return cancelled;
}

type ClaimResult =
  | { ok: true; legs: Stop[] }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "claimed"; by?: string };

// Driver claims (accepts) a whole ride — both the pickup and dropoff legs get
// stamped with the driver, and queued legs flip to "accepted". A ride already
// claimed by a *different* driver is refused so two vans don't both roll.
export async function claimRide(
  rideId: string,
  driver: { id: string; name: string },
): Promise<ClaimResult> {
  const state = await readState();
  const legs = state.stops.filter(
    (s) => s.rideId === rideId && s.status !== "cancelled" && s.status !== "dropped-off",
  );
  if (legs.length === 0) return { ok: false, reason: "not-found" };
  const taken = legs.find((s) => s.assignedDriverId && s.assignedDriverId !== driver.id);
  if (taken) return { ok: false, reason: "claimed", by: taken.assignedDriverName };

  const now = Date.now();
  for (const s of legs) {
    s.assignedDriverId = driver.id;
    s.assignedDriverName = driver.name;
    if (s.status === "queued") s.status = "accepted";
    // Claiming a ride you'd previously dismissed un-dismisses it.
    if (s.dismissedBy?.length) s.dismissedBy = s.dismissedBy.filter((id) => id !== driver.id);
    s.updatedAt = now;
  }
  await writeState(state);
  return { ok: true, legs };
}

// Driver declines a ride. If they'd claimed it, the claim is released back to
// the queue so the other van can take it. If it's still unclaimed, it's just
// dismissed from *this* driver's queue (stays live for everyone else).
export async function declineRide(
  rideId: string,
  driver: { id: string; name: string },
): Promise<{ ok: boolean; released: boolean }> {
  const state = await readState();
  const legs = state.stops.filter(
    (s) => s.rideId === rideId && s.status !== "cancelled" && s.status !== "dropped-off",
  );
  if (legs.length === 0) return { ok: false, released: false };

  const mine = legs.some((s) => s.assignedDriverId === driver.id);
  const now = Date.now();
  for (const s of legs) {
    if (mine) {
      if (s.assignedDriverId === driver.id) {
        s.assignedDriverId = undefined;
        s.assignedDriverName = undefined;
        if (s.status === "accepted" || s.status === "enroute") s.status = "queued";
        s.updatedAt = now;
      }
    } else if (!s.assignedDriverId) {
      s.dismissedBy = Array.from(new Set([...(s.dismissedBy ?? []), driver.id]));
      s.updatedAt = now;
    }
  }
  await writeState(state);
  return { ok: true, released: mine };
}

export async function remainingCapacity(): Promise<number> {
  const state = await readState();
  const reservedPickups = state.stops
    .filter((s) => (s.status === "queued" || s.status === "enroute") && s.kind === "pickup")
    .reduce((sum, s) => sum + s.partySize, 0);
  // TODO(two-shuttle): this is a fleet-wide pool, not per-van. Fine at current
  // volume; revisit if overbooking one van becomes a real problem.
  return Math.max(0, state.capacity - state.onboard - reservedPickups);
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  // Merge stored partial settings on top of defaults so fields added in
  // later versions (e.g. alertsEnabled) get sensible defaults for
  // installs that have already written settings to KV.
  if (useKV()) {
    const stored = await kvGet<Partial<Settings>>(KV_SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }
  if (!memory.__nomansSettings) memory.__nomansSettings = { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...memory.__nomansSettings };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };

  if (patch.capacity !== undefined) {
    // Mirror capacity into live state so the on-board counter respects it
    // immediately, without waiting for a fresh state init.
    const state = await readState();
    state.capacity = next.capacity;
    await writeState(state);
  }

  if (useKV()) await kvSet(KV_SETTINGS_KEY, next);
  else memory.__nomansSettings = next;
  return next;
}

// ---------- Drivers ----------

export async function getDrivers(): Promise<Driver[]> {
  if (useKV()) return (await kvGet<Driver[]>(KV_DRIVERS_KEY)) ?? [];
  return memory.__nomansDrivers ?? [];
}

export async function addDriver(input: { name: string; phone?: string | null }): Promise<Driver> {
  const drivers = await getDrivers();
  const driver: Driver = {
    id: cryptoRandomId(),
    name: input.name.trim().slice(0, 40) || "Driver",
    passcode: generateDriverCode(),
    phone: input.phone ?? null,
    onShift: false,
    createdAt: Date.now(),
  };
  drivers.push(driver);
  if (useKV()) await kvSet(KV_DRIVERS_KEY, drivers);
  else memory.__nomansDrivers = drivers;
  return driver;
}

export async function updateDriver(
  id: string,
  patch: Partial<Pick<Driver, "phone" | "onShift" | "name">>,
): Promise<Driver | null> {
  const drivers = await getDrivers();
  const driver = drivers.find((d) => d.id === id);
  if (!driver) return null;
  if (patch.name !== undefined) driver.name = patch.name.trim().slice(0, 40) || driver.name;
  if (patch.phone !== undefined) driver.phone = patch.phone || null;
  if (patch.onShift !== undefined) driver.onShift = Boolean(patch.onShift);
  if (useKV()) await kvSet(KV_DRIVERS_KEY, drivers);
  else memory.__nomansDrivers = drivers;
  return driver;
}

export async function removeDriver(id: string): Promise<boolean> {
  const drivers = await getDrivers();
  const next = drivers.filter((d) => d.id !== id);
  if (next.length === drivers.length) return false;
  if (useKV()) await kvSet(KV_DRIVERS_KEY, next);
  else memory.__nomansDrivers = next;
  return true;
}

// ---------- Ride archive (per-day, survives state wipes) ----------

// Day boundary is Eastern so a shift that crosses midnight UTC still
// counts as one workday.
export function rideDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function getRideArchive(day: string = rideDayKey()): Promise<Stop[]> {
  if (useKV()) return (await kvGet<Stop[]>(`${KV_RIDES_PREFIX}${day}`)) ?? [];
  return memory.__nomansRides?.[day] ?? [];
}

async function appendToRideArchive(stop: Stop): Promise<void> {
  const day = rideDayKey(new Date(stop.createdAt));
  const key = `${KV_RIDES_PREFIX}${day}`;
  // Replace by id so a stop moving through multiple terminal statuses
  // (e.g. picked-up → dropped-off) ends up with only the latest snapshot.
  if (useKV()) {
    const current = (await kvGet<Stop[]>(key)) ?? [];
    const next = [...current.filter((s) => s.id !== stop.id), stop];
    await kvSet(key, next);
  } else {
    memory.__nomansRides ??= {};
    const current = memory.__nomansRides[day] ?? [];
    memory.__nomansRides[day] = [...current.filter((s) => s.id !== stop.id), stop];
  }
}

// ---------- Bouncie webhook debug (TEMPORARY) ----------
// Captures the last few raw webhook payloads so we can see Bouncie's actual
// JSON shape and confirm the parser. Remove this whole section + its callers
// once live GPS is confirmed working.

export type BouncieDebugEntry = {
  receivedAt: number;
  secretOk: boolean;
  hadBody: boolean;
  vehicleId: string | null;
  parsed: { lat: number | null; lng: number | null; heading: number | null; speedMph: number | null };
  raw: string;
};

export async function pushBouncieDebug(entry: BouncieDebugEntry): Promise<void> {
  if (useKV()) {
    const cur = (await kvGet<BouncieDebugEntry[]>(KV_BOUNCIE_DEBUG_KEY)) ?? [];
    await kvSet(KV_BOUNCIE_DEBUG_KEY, [entry, ...cur].slice(0, 8));
  } else {
    memory.__nomansBouncieDebug = [entry, ...(memory.__nomansBouncieDebug ?? [])].slice(0, 8);
  }
}

export async function getBouncieDebug(): Promise<BouncieDebugEntry[]> {
  if (useKV()) return (await kvGet<BouncieDebugEntry[]>(KV_BOUNCIE_DEBUG_KEY)) ?? [];
  return memory.__nomansBouncieDebug ?? [];
}

export async function clearBouncieDebug(): Promise<void> {
  if (useKV()) await kvSet(KV_BOUNCIE_DEBUG_KEY, []);
  else memory.__nomansBouncieDebug = [];
}

// ---------- Managers (staff admin) ----------

export async function getManagers(): Promise<Manager[]> {
  if (useKV()) return (await kvGet<Manager[]>(KV_MANAGERS_KEY)) ?? [];
  return memory.__nomansManagers ?? [];
}

export async function addManager(input: {
  name: string;
  phone?: string | null;
}): Promise<Manager> {
  const managers = await getManagers();
  const manager: Manager = {
    id: cryptoRandomId(),
    name: input.name.trim().slice(0, 40) || "Manager",
    passcode: generateManagerCode(),
    phone: input.phone ?? null,
    createdAt: Date.now(),
  };
  managers.push(manager);
  if (useKV()) await kvSet(KV_MANAGERS_KEY, managers);
  else memory.__nomansManagers = managers;
  return manager;
}

export async function removeManager(id: string): Promise<boolean> {
  const managers = await getManagers();
  const next = managers.filter((m) => m.id !== id);
  if (next.length === managers.length) return false;
  if (useKV()) await kvSet(KV_MANAGERS_KEY, next);
  else memory.__nomansManagers = next;
  return true;
}

// ---------- Push subscriptions (Web Push / VAPID) ----------

export async function getPushSubscriptions(): Promise<StoredPushSub[]> {
  if (useKV()) return (await kvGet<StoredPushSub[]>(KV_PUSH_SUBS_KEY)) ?? [];
  return memory.__nomansPushSubs ?? [];
}

// Upsert by endpoint — re-subscribing on the same device replaces the
// old record. Optionally re-binds to a different driverId if a driver
// reuses the same browser.
export async function upsertPushSubscription(
  record: StoredPushSub,
): Promise<void> {
  const subs = await getPushSubscriptions();
  const next = [
    ...subs.filter((s) => s.subscription.endpoint !== record.subscription.endpoint),
    record,
  ];
  if (useKV()) await kvSet(KV_PUSH_SUBS_KEY, next);
  else memory.__nomansPushSubs = next;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const subs = await getPushSubscriptions();
  const next = subs.filter((s) => s.subscription.endpoint !== endpoint);
  if (useKV()) await kvSet(KV_PUSH_SUBS_KEY, next);
  else memory.__nomansPushSubs = next;
}

// ---------- helpers ----------

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateDriverCode(): string {
  return `NM-${codeSuffix()}`;
}

function generateManagerCode(): string {
  return `MGR-${codeSuffix()}`;
}

function codeSuffix(): string {
  // Crockford-ish alphabet — no 0/O/1/I to avoid sms confusion.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
