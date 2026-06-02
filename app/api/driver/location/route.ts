import { NextRequest, NextResponse } from "next/server";
import { upsertShuttle } from "@/lib/store";
import { resolveOperator } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Driver-phone location broadcast. Used as a fallback / pre-Bouncie
// option: the driver's tablet calls watchPosition() in the browser and
// POSTs each fix here. Same effect on the shuttle marker as Bouncie.
//
// Body: { lat: number, lng: number, heading?: number|null,
//         speed?: number|null /* m/s */, passcode: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const driver = await resolveOperator(body.passcode, body.van);
  if (!driver) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "bad coords" }, { status: 400 });
  }

  const headingRaw = Number(body.heading);
  const speedRaw = Number(body.speed);
  const heading = Number.isFinite(headingRaw) ? headingRaw : null;
  // Browser geolocation reports speed in m/s; convert to mph for display
  // parity with Bouncie payloads.
  const speedMph = Number.isFinite(speedRaw) ? speedRaw * 2.23694 : null;

  // Key by driver so a phone-broadcasting driver gets their own marker
  // (labelled with their name) rather than fighting a Bouncie van for the
  // single position slot.
  await upsertShuttle(`phone:${driver.id}`, {
    label: driver.name,
    position: { lat, lng },
    heading,
    speedMph,
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
