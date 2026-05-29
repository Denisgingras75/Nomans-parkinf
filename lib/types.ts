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
  position: LatLng | null;
  heading: number | null;
  speedMph: number | null;
  updatedAt: number | null;
  capacity: number;
  onboard: number;
};

export type StopStatus = "queued" | "enroute" | "picked-up" | "dropped-off" | "cancelled";

export type Stop = {
  id: string;
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
  shuttle: ShuttleState;
  stops: Stop[];
};
