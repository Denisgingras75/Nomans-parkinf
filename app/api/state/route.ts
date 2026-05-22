import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/store";
import { NOMANS, etaMinutes } from "@/lib/geofence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public state endpoint. Returns the shuttle's last known position plus
// the list of active stops. Polled by both the passenger and driver pages.
// If a `stopId` is provided we also return that passenger's queue position
// and ETA so the UI can show "Combi is 4 minutes away".
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const stopId = url.searchParams.get("stopId");
  const driver = url.searchParams.get("driver");
  const driverPass = process.env.DRIVER_PASSCODE;

  const state = getState();
  const activeStops = state.stops.filter((s) => s.status === "queued" || s.status === "enroute");

  // Strip notes for non-driver consumers — keeps PII out of the public feed.
  const isDriver = driver != null && driverPass != null && driver === driverPass;
  const publicStops = activeStops.map((s) => ({
    id: s.id,
    kind: s.kind,
    partySize: s.partySize,
    status: s.status,
    position: s.position,
    name: isDriver ? s.name : undefined,
    note: isDriver ? s.note : undefined,
  }));

  let yours: { etaMinutes: number | null; position: number; status: string } | null = null;
  if (stopId) {
    const me = state.stops.find((s) => s.id === stopId);
    if (me) {
      const queuedAhead = activeStops.filter(
        (s) => s.kind === "pickup" && s.createdAt < me.createdAt,
      ).length;
      const eta =
        state.shuttle.position && (me.status === "queued" || me.status === "enroute")
          ? etaMinutes(state.shuttle.position, me.position) + queuedAhead * 3
          : null;
      yours = { etaMinutes: eta, position: queuedAhead + 1, status: me.status };
    }
  }

  return NextResponse.json({
    shuttle: state.shuttle,
    stops: publicStops,
    nomans: NOMANS,
    yours,
  });
}
