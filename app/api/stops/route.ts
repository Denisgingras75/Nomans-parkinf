import { NextRequest, NextResponse } from "next/server";
import {
  cancelRide,
  claimRide,
  completeRide,
  declineRide,
  getDrivers,
  getSettings,
  setStopStatus,
  updateDriver,
} from "@/lib/store";
import { resolveOperator } from "@/lib/auth";
import { sendPushToDrivers } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preset, professional decline reasons the driver picks from. "done-for-day"
// also flips the driver off shift so they stop getting pinged.
const DECLINE_REASONS = new Set([
  "too-far",
  "too-busy",
  "busy-area",
  "done-for-day",
  "other",
]);

// Driver-only. Two modes:
//   - Ride action:    { action: "accept"|"decline"|"finish", rideId, passcode, reason? }
//       accept  → claim the ride (both legs)
//       decline → pass the ride to the next driver (release + dismiss for me),
//                 logging `reason`; re-pushes to the other on-shift drivers
//       finish  → complete the ride (both legs dropped-off), clearing the queue
//   - Advance a stop: { id, status: "enroute"|"picked-up"|"dropped-off"|"cancelled", passcode }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const driver = await resolveOperator(body.passcode, body.van);
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
      const res = await completeRide(rideId, driver.id);
      if (!res.ok) {
        const forbidden = res.reason === "forbidden";
        return NextResponse.json(
          { error: forbidden ? "that ride belongs to another driver" : "ride not found" },
          { status: forbidden ? 403 : 404 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    // decline: pass to the next driver.
    const reason =
      typeof body.reason === "string" && DECLINE_REASONS.has(body.reason) ? body.reason : "other";
    const res = await declineRide(rideId, driver, reason);
    if (!res.ok) {
      return NextResponse.json(
        { error: "can't pass this ride — it may be already picked up or gone" },
        { status: 409 },
      );
    }

    // "Done for the day" — take the driver off shift so they stop getting
    // pings. Surface a flag if it fails (KV hiccup / missing row) instead of
    // swallowing it, so the driver isn't left thinking they're off shift when
    // they're not. (No logger in this app — the flag rides back in the JSON.)
    let shiftUpdateFailed = false;
    if (reason === "done-for-day") {
      try {
        shiftUpdateFailed = (await updateDriver(driver.id, { onShift: false })) == null;
      } catch {
        shiftUpdateFailed = true;
      }
    }

    // If no one's holding the ride now, offer it to the drivers who haven't
    // passed it yet. If there's nobody left to offer it to, cancel it so the
    // passenger gets told instead of waiting on a ride no one will take.
    if (res.nowUnclaimed && res.pickup) {
      const p = res.pickup;
      const passed = new Set(p.dismissedBy ?? []);
      const eligible = (await getDrivers()).filter((d) => d.onShift && !passed.has(d.id));
      if (eligible.length === 0) {
        await cancelRide(p.id);
      } else {
        const settings = await getSettings();
        if (settings.alertsEnabled) {
          const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.position.lat},${p.position.lng}`;
          await sendPushToDrivers(
            eligible.map((d) => d.id),
            {
              title: "🚐 Pickup needs a driver",
              body: `${p.name} (party of ${p.partySize}) — another driver passed.`,
              url: "/driver",
              navUrl,
              tag: `reoffer-${rideId}`,
            },
          );
        }
      }
    }
    return NextResponse.json(shiftUpdateFailed ? { ok: true, shiftUpdateFailed } : { ok: true });
  }

  const id = String(body.id ?? "");
  const status = body.status;
  if (!id || !["enroute", "picked-up", "dropped-off", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "bad id or status" }, { status: 400 });
  }

  const updated = await setStopStatus(id, status, driver.id);
  if (!updated) return NextResponse.json({ error: "stop not found" }, { status: 404 });
  return NextResponse.json({ ok: true, stop: updated });
}
