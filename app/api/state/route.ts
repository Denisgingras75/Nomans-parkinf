import { NextRequest, NextResponse } from "next/server";
import { getSettings, getState } from "@/lib/store";
import { etaMinutes } from "@/lib/geofence";
import { isOnlineNow } from "@/lib/schedule";
import { findDriver, findFullDriver } from "@/lib/auth";

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

  // Two lookups: findDriver also accepts the legacy DRIVER_PASSCODE env
  // var (skeleton key for read access); findFullDriver only resolves
  // real driver rows, which is what the "me" field below needs.
  const [settings, state, driverRef, driverRow] = await Promise.all([
    getSettings(),
    getState(),
    findDriver(driverParam),
    findFullDriver(driverParam),
  ]);
  const isDriver = driverRef != null;

  // Show every van's last-known position. Freshness is conveyed by the
  // "signal stale (N min)" label the UI derives from updatedAt — we don't
  // hide a recently-idle/parked van, since Bouncie may go quiet between
  // rides. But a fix older than GHOST_MAX_MS is a dead/leftover marker (a
  // van that's been off for hours, or stale test data), so drop it entirely
  // rather than stranding an ancient dot on the map.
  const GHOST_MAX_MS = 3 * 60 * 60 * 1000; // 3h
  const now = Date.now();
  const liveShuttles = state.shuttles.filter(
    (s) => s.position != null && (s.updatedAt == null || now - s.updatedAt < GHOST_MAX_MS),
  );

  const myId = driverRef?.id ?? null;
  const activeStops = state.stops.filter(
    (s) => s.status === "queued" || s.status === "accepted" || s.status === "enroute",
  );

  // Drivers don't see rides they personally dismissed (unless they later
  // claimed them). Passengers see the full active set.
  const visibleStops = activeStops.filter(
    (s) => !(isDriver && s.dismissedBy?.includes(myId!) && s.assignedDriverId !== myId),
  );

  const publicStops = visibleStops.map((s) => ({
    id: s.id,
    rideId: isDriver ? s.rideId : undefined,
    kind: s.kind,
    partySize: s.partySize,
    status: s.status,
    position: s.position,
    name: isDriver ? s.name : undefined,
    note: isDriver ? s.note : undefined,
    phone: isDriver ? s.phone ?? null : undefined,
    assignedDriverId: isDriver ? s.assignedDriverId ?? null : undefined,
    assignedDriverName: isDriver ? s.assignedDriverName ?? null : undefined,
  }));

  let yours:
    | { etaMinutes: number | null; position: number; status: string; driverName: string | null }
    | null = null;
  if (stopId) {
    const me = state.stops.find((s) => s.id === stopId);
    if (me) {
      const queuedAhead = activeStops.filter(
        (s) => s.kind === "pickup" && s.createdAt < me.createdAt,
      ).length;
      // Prefer the assigned driver's own van (when they're broadcasting their
      // phone GPS) for ETA; otherwise fall back to the nearest live van.
      const assignedVan = me.assignedDriverId
        ? liveShuttles.find((s) => s.id === `phone:${me.assignedDriverId}`)
        : undefined;
      const etaSource = assignedVan ? [assignedVan] : liveShuttles;
      const enRoute =
        me.status === "queued" || me.status === "accepted" || me.status === "enroute";
      const eta =
        etaSource.length && enRoute
          ? Math.min(...etaSource.map((s) => etaMinutes(s.position!, me.position))) +
            queuedAhead * 3
          : null;
      yours = {
        etaMinutes: eta,
        position: queuedAhead + 1,
        status: me.status,
        driverName: me.assignedDriverName ?? null,
      };
    }
  }

  const me = driverRow
    ? {
        id: driverRow.id,
        name: driverRow.name,
        onShift: Boolean(driverRow.onShift),
        phone: driverRow.phone ?? null,
      }
    : null;

  return NextResponse.json({
    shuttles: liveShuttles.map((s) => ({
      id: s.id,
      // Owner-assigned name (e.g. "Van 1") wins; else the upsert-time label
      // (driver name for phone broadcasts); else generic "Combi" in the UI.
      label: settings.vehicleLabels?.[s.id] ?? s.label ?? null,
      position: s.position,
      heading: s.heading,
      speedMph: s.speedMph,
      updatedAt: s.updatedAt,
    })),
    onboard: state.onboard,
    capacity: state.capacity,
    stops: publicStops,
    nomans: settings.nomans,
    online: isOnlineNow(settings),
    yours,
    me,
  });
}
