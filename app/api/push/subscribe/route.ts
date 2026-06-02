import { NextRequest, NextResponse } from "next/server";
import { resolveOperator } from "@/lib/auth";
import { upsertPushSubscription } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Driver-initiated push subscribe. The PWA's "Enable phone alerts"
// button calls navigator.serviceWorker.ready.pushManager.subscribe()
// and POSTs the resulting subscription here, scoped to the driver's
// passcode so we know whom to fan out to on a new pickup.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const driver = await resolveOperator(body.passcode, body.van);
  if (!driver) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sub = body.subscription;
  if (
    !sub ||
    typeof sub.endpoint !== "string" ||
    !sub.keys ||
    typeof sub.keys.p256dh !== "string" ||
    typeof sub.keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "bad subscription shape" }, { status: 400 });
  }

  await upsertPushSubscription({
    driverId: driver.id,
    subscription: {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime ?? null,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
    createdAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
