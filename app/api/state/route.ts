import { NextRequest, NextResponse } from "next/server";
import { getSettings, getState } from "@/lib/store";
import { etaMinutes } from "@/lib/geofence";
import { isOnlineNow } from "@/lib/schedule";
import { findDriver } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public state endpoint. Returns the shuttle's last known position, the
// list of active stops, the NoMans pin location, and whether the
// service is online. Polled by passenger and driver pages.
//
// If `stopId` is provided we also return that passenger's queue
// position and ETA. If `driver` is provided and matches a real driver
// passcode, we include passenger names and notes in the stops list.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const stopId = url.searchParams.get("stopId");
  const driverParam = url.searchParams.get("driver");

  const [settings, state, driver] = await Promise.all([
    getSettings(),
    getState(),
    findDriver(driverParam),
  ]);
  const isDriver = driver != null;

  const activeStops = state.stops.filter((s) => s.status === "queued" || s.status === "enroute");

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
    nomans: settings.nomans,
    online: isOnlineNow(settings),
    yours,
  });
}
