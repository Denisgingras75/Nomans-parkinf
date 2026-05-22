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

const useKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const memory = globalThis as unknown as {
  __nomansState?: AppState;
  __nomansSettings?: Settings;
  __nomansDrivers?: Driver[];
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

async function kvGet<T>(key: string): Promise<T | null> {
  const { kv } = await import("@vercel/kv");
  return (await kv.get<T>(key)) ?? null;
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(key, value);
}

// ---------- State (shuttle position + active queue) ----------

async function readState(): Promise<AppState> {
  if (useKV) return (await kvGet<AppState>(KV_STATE_KEY)) ?? initState();
  if (!memory.__nomansState) memory.__nomansState = initState();
  return memory.__nomansState;
}

async function writeState(state: AppState): Promise<void> {
  if (useKV) await kvSet(KV_STATE_KEY, state);
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
  if (useKV) {
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

  if (useKV) await kvSet(KV_SETTINGS_KEY, next);
  else memory.__nomansSettings = next;
  return next;
}

// ---------- Drivers ----------

export async function getDrivers(): Promise<Driver[]> {
  if (useKV) return (await kvGet<Driver[]>(KV_DRIVERS_KEY)) ?? [];
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
  if (useKV) await kvSet(KV_DRIVERS_KEY, drivers);
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
  if (useKV) await kvSet(KV_DRIVERS_KEY, drivers);
  else memory.__nomansDrivers = drivers;
  return driver;
}

export async function removeDriver(id: string): Promise<boolean> {
  const drivers = await getDrivers();
  const next = drivers.filter((d) => d.id !== id);
  if (next.length === drivers.length) return false;
  if (useKV) await kvSet(KV_DRIVERS_KEY, next);
  else memory.__nomansDrivers = next;
  return true;
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
