import type { AppState, Driver, LatLng, Settings, Stop, StopStatus } from "./types";
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
const KV_RIDES_PREFIX = "nomans:rides:"; // suffix: YYYY-MM-DD (Eastern)

// Always attempt KV first. The @vercel/kv client throws if env vars
// aren't injected; we catch in the helpers below and fall back to
// in-memory so `npm run dev` without KV still works.
function useKV(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

const memory = globalThis as unknown as {
  __nomansState?: AppState;
  __nomansSettings?: Settings;
  __nomansDrivers?: Driver[];
  __nomansRides?: Record<string, Stop[]>;
};

const DEFAULT_SETTINGS: Settings = {
  nomans: DEFAULT_NOMANS,
  bounds: DEFAULT_BOUNDS,
  capacity: 8,
  online: true,
  alertsEnabled: true,
  hours: DEFAULT_HOURS,
};

function initState(): AppState {
  return {
    shuttle: {
      position: null,
      heading: null,
      speedMph: null,
      updatedAt: null,
      capacity: DEFAULT_SETTINGS.capacity,
      onboard: 0,
    },
    stops: [],
  };
}

// Direct Upstash REST calls. Avoids @vercel/kv's import-time client
// initialization which was causing cold-start instances to read env
// vars before Vercel had fully injected them.
async function kvGet<T>(key: string): Promise<T | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
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
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(value),
    cache: "no-store",
  });
}

// ---------- State (shuttle position + active queue) ----------

async function readState(): Promise<AppState> {
  if (useKV()) return (await kvGet<AppState>(KV_STATE_KEY)) ?? initState();
  if (!memory.__nomansState) memory.__nomansState = initState();
  return memory.__nomansState;
}

async function writeState(state: AppState): Promise<void> {
  if (useKV()) await kvSet(KV_STATE_KEY, state);
  else memory.__nomansState = state;
}

export async function getState(): Promise<AppState> {
  return readState();
}

export async function updateShuttle(patch: Partial<AppState["shuttle"]>): Promise<void> {
  const state = await readState();
  Object.assign(state.shuttle, patch);
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
    state.shuttle.onboard = Math.min(state.shuttle.capacity, state.shuttle.onboard + stop.partySize);
  }
  if (status === "dropped-off") {
    state.shuttle.onboard = Math.max(0, state.shuttle.onboard - stop.partySize);
  }
  await writeState(state);
  if (status === "picked-up" || status === "dropped-off" || status === "cancelled") {
    await appendToRideArchive(stop);
  }
  return stop;
}

export async function remainingCapacity(): Promise<number> {
  const state = await readState();
  const reservedPickups = state.stops
    .filter((s) => (s.status === "queued" || s.status === "enroute") && s.kind === "pickup")
    .reduce((sum, s) => sum + s.partySize, 0);
  return Math.max(0, state.shuttle.capacity - state.shuttle.onboard - reservedPickups);
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
    state.shuttle.capacity = next.capacity;
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

// ---------- helpers ----------

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateDriverCode(): string {
  // Crockford-ish alphabet — no 0/O/1/I to avoid sms confusion.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `NM-${suffix}`;
}
