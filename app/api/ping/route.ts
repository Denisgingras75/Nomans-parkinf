import { NextRequest, NextResponse } from "next/server";
import { addStop, cancelRide, getDrivers, getSettings, remainingCapacity } from "@/lib/store";
import { inBounds } from "@/lib/geofence";
import { isOnlineNow } from "@/lib/schedule";
import { normalizePhone, notifyOnShiftDrivers } from "@/lib/sms";
import { sendPushToDrivers } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const settings = await getSettings();
  if (!isOnlineNow(settings)) {
    return NextResponse.json(
      { error: "The combi is off duty right now. Please try again later.", code: "offline" },
      { status: 503 },
    );
  }

  const name = String(body.name ?? "").trim().slice(0, 40);
  const partySize = clampInt(body.partySize, 1, 6);
  const direction = body.direction === "to-nomans" ? "to-nomans" : "from-nomans";
  const note = body.note ? String(body.note).trim().slice(0, 140) : undefined;
  const phone = body.phone ? normalizePhone(String(body.phone)) : null;

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

  // One rideId ties the pickup + dropoff legs together so a passenger cancel
  // can clear both.
  const rideId = crypto.randomUUID();
  let pickupId: string;
  if (direction === "to-nomans") {
    const pickup = await addStop({
      rideId,
      kind: "pickup",
      name,
      partySize,
      position: { lat, lng },
      note,
      phone,
    });
    await addStop({
      rideId,
      kind: "dropoff",
      name,
      partySize,
      position: settings.nomans,
      note: "NoMans Restaurant",
      phone,
    });
    pickupId = pickup.id;
  } else {
    const pickup = await addStop({
      rideId,
      kind: "pickup",
      name,
      partySize,
      position: settings.nomans,
      note: "NoMans Restaurant",
      phone,
    });
    await addStop({
      rideId,
      kind: "dropoff",
      name,
      partySize,
      position: { lat, lng },
      note,
      phone,
    });
    pickupId = pickup.id;
  }

  if (settings.alertsEnabled) {
    const origin = new URL(req.url).origin;
    const where = direction === "to-nomans" ? "TO NoMans" : "FROM NoMans";
    const noteTail = note ? ` Note: "${note.slice(0, 80)}"` : "";
    const phoneTail = phone ? ` ${phone}` : "";
    const smsBody = `🚐 NoMans Combi: ${where}, ${name}${phoneTail} (party of ${partySize}).${noteTail} Open ${origin}/driver`;
    const drivers = await getDrivers();
    const onShiftIds = drivers.filter((d) => d.onShift).map((d) => d.id);

    // Fan out via both channels in parallel — Web Push for drivers who
    // installed the PWA, Twilio SMS for the rest. Push is cheaper, faster,
    // and works even when /driver is closed. SMS stays as fallback until
    // every driver has installed the app.
    await Promise.allSettled([
      sendPushToDrivers(onShiftIds, {
        title: "🚐 New pickup",
        body: `${where} — ${name} (party of ${partySize})${note ? ` · "${note.slice(0, 80)}"` : ""}`,
        url: "/driver",
      }),
      notifyOnShiftDrivers(drivers, smsBody),
    ]);
  }

  return NextResponse.json({ ok: true, stopId: pickupId });
}

// Passenger self-cancel. No auth: the random stopId from POST is the
// capability token — only the passenger who pinged holds it. Cancels both
// legs of the ride.
export async function DELETE(req: NextRequest) {
  const stopId = new URL(req.url).searchParams.get("stopId");
  if (!stopId) {
    return NextResponse.json({ error: "stopId required" }, { status: 400 });
  }
  const cancelled = await cancelRide(stopId);
  if (cancelled === null) {
    return NextResponse.json({ error: "ride not found" }, { status: 404 });
  }
  if (cancelled.length === 0) {
    // Already picked up or otherwise too late to self-cancel.
    return NextResponse.json(
      { ok: false, error: "too late to cancel — your driver is on the way", code: "too-late" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, cancelled: cancelled.length });
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
