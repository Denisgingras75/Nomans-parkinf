import { NextRequest, NextResponse } from "next/server";
import { upsertShuttle, pushBouncieDebug } from "@/lib/store";

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
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-bouncie-secret");
  const secretOk = Boolean(expected) && provided === expected;

  // Read the raw text first so we can capture it for debugging even when the
  // body isn't valid JSON.
  const rawText = await req.text();
  let body: any = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }

  // Bouncie's payload shape varies by event type. The fields we care about
  // (location/heading/speed) live under different keys depending on whether
  // this is `connect`, `disconnect`, `tripStart`, `tripData`, `tripEnd`...
  //
  // `tripData` (the one that carries live GPS) sends a `data` array of
  // breadcrumb points; the freshest fix is the LAST element, and its
  // coordinates sit under `location` (lat/lon) — NOT at the top level. Other
  // event types put a single location at the root. Be liberal: dig the
  // newest point out of `data[]`, then accept location/gps nesting or a flat
  // lat/lon, under several key spellings.
  const vehicleId = body?.vin ?? body?.imei ?? body?.vehicleId ?? null;
  const points = Array.isArray(body?.data) ? body.data : null;
  const latest = points && points.length ? points[points.length - 1] : null;
  const loc =
    latest?.location ??
    latest?.gps ??
    latest ??
    body?.location ??
    body?.gps ??
    body?.data?.location ??
    body ??
    {};
  const lat = numeric(loc?.lat ?? loc?.latitude);
  const lng = numeric(loc?.lon ?? loc?.lng ?? loc?.longitude);
  const heading = numeric(latest?.heading ?? loc?.heading ?? body?.heading);
  const speedMph = numeric(latest?.speed ?? loc?.speed ?? body?.speed);

  // --- TEMP DEBUG: capture every hit (incl. wrong-secret) so we can see what
  // Bouncie actually sends. Remove with the rest of the debug plumbing. ---
  await pushBouncieDebug({
    receivedAt: Date.now(),
    secretOk,
    hadBody: body != null,
    vehicleId: vehicleId != null ? String(vehicleId) : null,
    parsed: { lat, lng, heading, speedMph },
    raw: rawText.slice(0, 4000),
  });

  if (!expected) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }
  if (!secretOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const allowedVehicle = process.env.SHUTTLE_VEHICLE_ID;
  if (allowedVehicle && vehicleId && String(vehicleId) !== allowedVehicle) {
    return NextResponse.json({ ok: true, ignored: "different vehicle" });
  }

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
