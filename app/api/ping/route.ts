import { NextRequest, NextResponse } from "next/server";
import { addStop, getDrivers, getSettings, remainingCapacity } from "@/lib/store";
import { inBounds } from "@/lib/geofence";
import { notifyOnShiftDrivers } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const settings = await getSettings();
  if (!settings.online) {
    return NextResponse.json(
      { error: "The combi is off duty right now. Please try again later.", code: "offline" },
      { status: 503 },
    );
  }

  const name = String(body.name ?? "").trim().slice(0, 40);
  const partySize = clampInt(body.partySize, 1, 6);
  const direction = body.direction === "to-nomans" ? "to-nomans" : "from-nomans";
  const note = body.note ? String(body.note).trim().slice(0, 140) : undefined;

  const lat = Number(body?.position?.lat);
  const lng = Number(body?.position?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "share location to ping the shuttle" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  if (!inBounds({ lat, lng }, settings.bounds)) {
    return NextResponse.json(
      { error: "outside the Oak Bluffs service area — only Oak Bluffs pickups and dropoffs are served" },
      { status: 422 },
    );
  }

  const remaining = await remainingCapacity();
  if (partySize > remaining) {
    return NextResponse.json(
      { error: `shuttle is at capacity (${remaining} seats left)`, code: "full" },
      { status: 409 },
    );
  }

  let pickupId: string;
  if (direction === "to-nomans") {
    const pickup = await addStop({
      kind: "pickup",
      name,
      partySize,
      position: { lat, lng },
      note,
    });
    await addStop({
      kind: "dropoff",
      name,
      partySize,
      position: settings.nomans,
      note: "NoMans Restaurant",
    });
    pickupId = pickup.id;
  } else {
    const pickup = await addStop({
      kind: "pickup",
      name,
      partySize,
      position: settings.nomans,
      note: "NoMans Restaurant",
    });
    await addStop({
      kind: "dropoff",
      name,
      partySize,
      position: { lat, lng },
      note,
    });
    pickupId = pickup.id;
  }

  if (settings.alertsEnabled) {
    const origin = new URL(req.url).origin;
    const where = direction === "to-nomans" ? "TO NoMans" : "FROM NoMans";
    const noteTail = note ? ` Note: "${note.slice(0, 80)}"` : "";
    const body = `🚐 NoMans Combi: ${where}, ${name} (party of ${partySize}).${noteTail} Open ${origin}/driver`;
    const drivers = await getDrivers();
    // Awaited so we know the dispatch finished before the serverless
    // instance terminates. Each send has a 2.5s timeout, capped at the
    // number of on-shift drivers, so worst case adds a couple of seconds
    // to the ping response on a Twilio outage.
    await notifyOnShiftDrivers(drivers, body);
  }

  return NextResponse.json({ ok: true, stopId: pickupId });
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
