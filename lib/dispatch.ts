import type { Driver, Stop } from "./types";

// A van counts as "on a ride" while it holds any leg in one of these states.
const ACTIVE_RIDE_STATUSES = new Set(["accepted", "enroute", "picked-up"]);

// Single source of truth for "who should be alerted about this pickup".
//
// Van-priority dispatch: a van is "in service" if its phone has a push
// subscription, "busy" if it's holding an active ride. Alert Van 1 first; if
// Van 1 is busy, Van 2 (when in service); if every in-service van is busy,
// alert them all so the ride isn't dropped (they grab it when free). With no
// van in service, fall back to the on-shift real drivers (legacy single pool).
//
// `exclude` is the set of operator ids who already passed this ride, so a
// re-offer skips them (and so a van that just declined isn't handed it again).
//
// Used by BOTH the initial /api/ping dispatch and the /api/stops decline
// re-offer — keeping them in one place is what stops the two paths from
// disagreeing about who can take a ride.
export function resolveDispatchTargets(input: {
  subs: { driverId: string }[];
  stops: Stop[];
  drivers: Driver[];
  exclude?: Set<string>;
}): string[] {
  const { subs, stops, drivers, exclude } = input;
  const excluded = (id: string) => exclude?.has(id) ?? false;
  const inService = (id: string) => !excluded(id) && subs.some((s) => s.driverId === id);
  const busy = (id: string) =>
    stops.some((s) => s.assignedDriverId === id && ACTIVE_RIDE_STATUSES.has(s.status));

  const van1Up = inService("van1");
  const van2Up = inService("van2");
  if (van1Up || van2Up) {
    if (van1Up && !busy("van1")) return ["van1"];
    if (van2Up && !busy("van2")) return ["van2"];
    return ["van1", "van2"].filter((v) => (v === "van1" ? van1Up : van2Up));
  }
  return drivers.filter((d) => d.onShift && !excluded(d.id)).map((d) => d.id);
}
