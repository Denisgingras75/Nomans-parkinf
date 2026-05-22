export type LatLng = { lat: number; lng: number };

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
  status: StopStatus;
  createdAt: number;
  updatedAt: number;
};

export type AppState = {
  shuttle: ShuttleState;
  stops: Stop[];
};
