import { NextRequest, NextResponse } from "next/server";
import { getDrivers, getSettings, getState } from "@/lib/store";
import { etaMinutes } from "@/lib/geofence";
import { isOnlineNow } from "@/lib/schedule";
import { findFullDriver, normalizeVan, resolveOperator, vanName } from "@/lib/auth";

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
  const vanParam = url.searchParams.get("van");

  // resolveOperator gates on the passcode (shared DRIVER_PASSCODE or a real NM
  // code) and, when a van is selected, returns the van as the identity.
  // findFullDriver only resolves real rows, for the on-shift/phone fields.
  const [settings, state, driverRef, driverRow] = await Promise.all([
    getSettings(),
    getState(),
    resolveOperator(driverParam, vanParam),
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
    createdAt: isDriver ? s.createdAt : undefined,
    name: isDriver ? s.name : undefined,
    note: isDriver ? s.note : undefined,
    phone: isDriver ? s.phone ?? null : undefined,
    assignedDriverId: isDriver ? s.assignedDriverId ?? null : undefined,
    assignedDriverName: isDriver ? s.assignedDriverName ?? null : undefined,
  }));

  let yours:
    | {
        etaMinutes: number | null;
        position: number;
        status: string;
        driverName: string | null;
        driverPhone: string | null;
        reassigning: boolean;
      }
    | null = null;
  if (stopId) {
    const me = state.stops.find((s) => s.id === stopId);
    if (me) {
      // Only genuinely-waiting (unclaimed) pickups count toward the position —
      // a pickup a driver already accepted isn't "ahead in line" anymore.
      const queuedAhead = activeStops.filter(
        (s) => s.kind === "pickup" && !s.assignedDriverId && s.createdAt < me.createdAt,
      ).length;
      // A ride that's been passed by a driver and is now waiting again (no
      // current driver, but has a decline on record) — so the passenger card
      // can say "finding you another driver" instead of silently reverting.
      const reassigning =
        !me.assignedDriverId &&
        (me.declines?.length ?? 0) > 0 &&
        (me.status === "queued" || me.status === "accepted" || me.status === "enroute");
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
      // Surface the assigned driver's name + number so the passenger can see
      // who's coming and tap to call them right from the status card.
      let driverPhone: string | null = null;
      if (me.assignedDriverId) {
        const drivers = await getDrivers();
        driverPhone = drivers.find((d) => d.id === me.assignedDriverId)?.phone ?? null;
      }
      yours = {
        etaMinutes: eta,
        position: queuedAhead + 1,
        status: me.status,
        driverName: me.assignedDriverName ?? null,
        driverPhone,
        reassigning,
      };
    }
  }

  // `me` is what the driver dashboard uses to tell which rides are "mine".
  // A selected van is the identity; else the real driver row; else fall back to
  // the resolved ref so the shared DRIVER_PASSCODE (no row) still gets a stable
  // id. Without a stable id, claimed rides render as "claimed by another
  // driver" and lose their action buttons.
  const vanId = normalizeVan(vanParam);
  const me = !driverRef // passcode didn't validate → no identity (van param alone can't authenticate)
    ? null
    : vanId
    ? { id: vanId, name: vanName(vanId), onShift: true, phone: null, legacy: false, van: vanId }
    : driverRow
    ? {
        id: driverRow.id,
        name: driverRow.name,
        onShift: Boolean(driverRow.onShift),
        phone: driverRow.phone ?? null,
        legacy: false,
        van: null,
      }
    : { id: driverRef.id, name: driverRef.name, onShift: true, phone: null, legacy: true, van: null };

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
    bounds: settings.bounds,
    online: isOnlineNow(settings),
    yours,
    me,
  });
}
