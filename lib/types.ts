export type LatLng = { lat: number; lng: number };

export type BBox = { south: number; north: number; west: number; east: number };

export type ServiceHours = {
  enabled: boolean;
  open: string;
  close: string;
};

export type Settings = {
  nomans: LatLng;
  bounds: BBox;
  capacity: number;
  online: boolean;
  alertsEnabled: boolean;
  hours: ServiceHours;
  // Friendly names for the map dots, keyed by shuttle id (Bouncie VIN/IMEI,
  // or "phone:<driverId>"). e.g. { "1G1234...": "Van 1" }. Owner-editable.
  vehicleLabels: Record<string, string>;
};

export type Driver = {
  id: string;
  name: string;
  passcode: string;
  phone?: string | null;
  onShift?: boolean;
  createdAt: number;
};

export type Manager = {
  id: string;
  name: string;
  passcode: string;       // "MGR-XXXXXX"
  phone?: string | null;  // optional, not used for SMS today but room to grow
  createdAt: number;
};

export type ShuttleState = {
  // Stable per-vehicle id: a Bouncie VIN/IMEI, or "phone:<driverId>" for a
  // driver broadcasting from their phone. Keys the shuttle in AppState.shuttles
  // so two vans on one Bouncie account don't clobber each other.
  id: string;
  label?: string;
  position: LatLng | null;
  heading: number | null;
  speedMph: number | null;
  updatedAt: number | null;
};

export type StopStatus = "queued" | "accepted" | "enroute" | "picked-up" | "dropped-off" | "cancelled";

export type Stop = {
  id: string;
  // Links the pickup + dropoff legs created by a single passenger ping, so a
  // passenger cancel can clear both. Optional: legacy stops predate it.
  rideId?: string;
  kind: "pickup" | "dropoff";
  name: string;
  partySize: number;
  position: LatLng;
  note?: string;
  phone?: string | null;
  status: StopStatus;
  // Set when a driver claims (accepts) the ride — both legs get stamped.
  // Other drivers see it locked; the passenger sees who's coming.
  assignedDriverId?: string;
  assignedDriverName?: string;
  // Driver ids that declined/dismissed this ride from their own queue, so it
  // moves on to the next driver and they don't get re-offered it. Server-
  // filtered per driver; the ride stays live for everyone else.
  dismissedBy?: string[];
  // Audit trail of driver declines (with a reason) so the owner can see why a
  // ride bounced between drivers. Newest last; capped.
  declines?: { by: string; reason: string; at: number }[];
  createdAt: number;
  updatedAt: number;
};

export type AppState = {
  // One entry per live vehicle. Was a single `shuttle` before two vans
  // shared the Bouncie account; see CLAUDE.md decision #7.
  shuttles: ShuttleState[];
  // Fleet-wide seat pool. Kept global (not per-van) for now — see the
  // per-van capacity TODO in store.ts.
  capacity: number;
  onboard: number;
  stops: Stop[];
};
