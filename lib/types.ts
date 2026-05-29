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

export type StopStatus = "queued" | "enroute" | "picked-up" | "dropped-off" | "cancelled";

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
