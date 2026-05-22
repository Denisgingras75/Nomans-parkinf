import type { AppState, LatLng, Stop, StopStatus } from "./types";

// Module-scoped in-memory store. Survives between requests on a single
// long-running Node process (next dev, next start, a single Vercel
// instance). It does NOT survive across cold starts or multiple serverless
// regions — for production swap this for Vercel KV / Upstash Redis /
// Postgres. The public API of this module stays the same.
const globalForStore = globalThis as unknown as { __nomansState?: AppState };

function init(): AppState {
  return {
    shuttle: {
      position: null,
      heading: null,
      speedMph: null,
      updatedAt: null,
      capacity: 8,
      onboard: 0,
    },
    stops: [],
  };
}

function state(): AppState {
  if (!globalForStore.__nomansState) globalForStore.__nomansState = init();
  return globalForStore.__nomansState;
}

export function getState(): AppState {
  return state();
}

export function updateShuttle(patch: Partial<AppState["shuttle"]>): void {
  Object.assign(state().shuttle, patch);
}

export function addStop(input: Omit<Stop, "id" | "status" | "createdAt" | "updatedAt">): Stop {
  const now = Date.now();
  const stop: Stop = {
    ...input,
    id: cryptoRandomId(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  state().stops.push(stop);
  return stop;
}

export function setStopStatus(id: string, status: StopStatus): Stop | null {
  const stop = state().stops.find((s) => s.id === id);
  if (!stop) return null;
  stop.status = status;
  stop.updatedAt = Date.now();
  if (status === "picked-up" && stop.kind === "pickup") {
    state().shuttle.onboard = Math.min(state().shuttle.capacity, state().shuttle.onboard + stop.partySize);
  }
  if (status === "dropped-off") {
    state().shuttle.onboard = Math.max(0, state().shuttle.onboard - stop.partySize);
  }
  return stop;
}

export function activeStops(): Stop[] {
  return state().stops.filter((s) => s.status === "queued" || s.status === "enroute");
}

export function remainingCapacity(): number {
  const s = state().shuttle;
  const reserved = activeStops()
    .filter((stop) => stop.kind === "pickup")
    .reduce((sum, stop) => sum + stop.partySize, 0);
  return Math.max(0, s.capacity - s.onboard - reserved);
}

function cryptoRandomId(): string {
  // Avoid pulling in uuid; built-in is enough.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
