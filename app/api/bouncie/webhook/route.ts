import { NextRequest, NextResponse } from "next/server";
import { upsertShuttle } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bouncie pushes JSON to this endpoint when the shuttle's OBD-II device
// reports new telemetry. Configure the URL and shared secret in the
// Bouncie Developer Portal.
//
// We accept the secret either as `?secret=` (Bouncie supports query
// params on the configured URL) or as an `X-Bouncie-Secret` header.
export async function POST(req: NextRequest) {
  const expected = process.env.BOUNCIE_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-bouncie-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // Bouncie's payload shape varies by event type. The fields we care about
  // (location/heading/speed) live under different keys depending on
  // whether this is `connect`, `disconnect`, `tripData`, or `mil` etc.
  // Be liberal in what we accept.
  const allowedVehicle = process.env.SHUTTLE_VEHICLE_ID;
  const vehicleId = body.vin ?? body.imei ?? body.vehicleId;
  if (allowedVehicle && vehicleId && String(vehicleId) !== allowedVehicle) {
    return NextResponse.json({ ok: true, ignored: "different vehicle" });
  }

  const loc = body.location ?? body.data?.location ?? body;
  const lat = numeric(loc?.lat ?? loc?.latitude);
  const lng = numeric(loc?.lon ?? loc?.lng ?? loc?.longitude);
  const heading = numeric(loc?.heading ?? body.heading);
  const speedMph = numeric(loc?.speed ?? body.speed);

  if (lat == null || lng == null) {
    return NextResponse.json({ ok: true, ignored: "no coordinates in payload" });
  }

  // Key the shuttle by its vehicle id so two vans on one Bouncie account
  // each get their own marker instead of overwriting a single position.
  // Falls back to a constant id for accounts that don't send a vehicle id.
  const shuttleId = vehicleId ? String(vehicleId) : "bouncie";
  await upsertShuttle(shuttleId, {
    position: { lat, lng },
    heading: heading ?? null,
    speedMph: speedMph ?? null,
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
