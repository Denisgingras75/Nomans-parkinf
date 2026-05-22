import type { AppState, LatLng, Stop, StopStatus } from "./types";

// Store layer. Persists to Vercel KV (Upstash) when the integration is
// configured, otherwise falls back to a module-scoped in-memory map.
// The in-memory fallback survives between requests on a single Node
// process — enough for `npm run dev` and quick demos, NOT enough for
// serverless cold starts.
//
// KV is detected via the env vars Vercel sets when you add the
// Upstash Redis / Vercel KV marketplace integration. Nothing else
// in the codebase needs to know which backend is in use.

const KV_KEY = "nomans:state:v1";
const useKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

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

async function readState(): Promise<AppState> {
  if (useKV) {
    const { kv } = await import("@vercel/kv");
    const stored = await kv.get<AppState>(KV_KEY);
    return stored ?? init();
  }
  if (!globalForStore.__nomansState) globalForStore.__nomansState = init();
  return globalForStore.__nomansState;
}

async function writeState(state: AppState): Promise<void> {
  if (useKV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, state);
    return;
  }
  globalForStore.__nomansState = state;
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

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
