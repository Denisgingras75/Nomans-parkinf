import { NextRequest, NextResponse } from "next/server";
import { cancelRideByDriver, claimRide, completeRide, setStopStatus } from "@/lib/store";
import { findDriver } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Driver-only. Two modes:
//   - Ride action:    { action: "accept"|"decline"|"finish", rideId, passcode }
//       accept  → claim the ride (both legs)
//       decline → cancel the ride outright + flip the passenger's feed to "cancelled"
//       finish  → complete the ride (both legs dropped-off), clearing the queue
//   - Advance a stop: { id, status: "enroute"|"picked-up"|"dropped-off"|"cancelled", passcode }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const driver = await findDriver(body.passcode);
  if (!driver) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ride-level actions (operate on both legs via rideId).
  if (body.action === "accept" || body.action === "decline" || body.action === "finish") {
    const rideId = String(body.rideId ?? "");
    if (!rideId) return NextResponse.json({ error: "rideId required" }, { status: 400 });

    if (body.action === "accept") {
      const res = await claimRide(rideId, driver);
      if (!res.ok && res.reason === "not-found") {
        return NextResponse.json({ error: "ride not found" }, { status: 404 });
      }
      if (!res.ok && res.reason === "claimed") {
        return NextResponse.json(
          { error: `already claimed by ${res.by ?? "another driver"}`, code: "claimed" },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "finish") {
      const res = await completeRide(rideId);
      if (!res.ok) return NextResponse.json({ error: "ride not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    const res = await cancelRideByDriver(rideId);
    if (!res.ok) return NextResponse.json({ error: "ride not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  const status = body.status;
  if (!id || !["enroute", "picked-up", "dropped-off", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "bad id or status" }, { status: 400 });
  }

  const updated = await setStopStatus(id, status);
  if (!updated) return NextResponse.json({ error: "stop not found" }, { status: 404 });
  return NextResponse.json({ ok: true, stop: updated });
}
