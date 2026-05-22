import { NextRequest, NextResponse } from "next/server";
import { addStop, remainingCapacity } from "@/lib/store";
import { NOMANS, inOakBluffs } from "@/lib/geofence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
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

  // For "to-nomans" trips the ping origin must be inside Oak Bluffs.
  // For "from-nomans" trips the passenger is already at NoMans; the dropoff
  // address they typed/dropped pin needs to be in Oak Bluffs.
  if (!inOakBluffs({ lat, lng })) {
    return NextResponse.json(
      { error: "outside the Oak Bluffs zone — only Oak Bluffs pickups/dropoffs are served" },
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
      position: NOMANS,
      note: "NoMans Restaurant",
    });
    return NextResponse.json({ ok: true, stopId: pickup.id });
  }

  const pickup = await addStop({
    kind: "pickup",
    name,
    partySize,
    position: NOMANS,
    note: "NoMans Restaurant",
  });
  await addStop({
    kind: "dropoff",
    name,
    partySize,
    position: { lat, lng },
    note,
  });
  return NextResponse.json({ ok: true, stopId: pickup.id });
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
