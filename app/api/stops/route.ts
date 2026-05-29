import { NextRequest, NextResponse } from "next/server";
import { claimRide, declineRide, setStopStatus } from "@/lib/store";
import { findDriver } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Driver-only. Two modes:
//   - Claim a ride:   { action: "accept"|"decline", rideId, passcode }
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

  // Ride-level claim/decline (operates on both legs via rideId).
  if (body.action === "accept" || body.action === "decline") {
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

    const res = await declineRide(rideId, driver);
    if (!res.ok) return NextResponse.json({ error: "ride not found" }, { status: 404 });
    return NextResponse.json({ ok: true, released: res.released });
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
