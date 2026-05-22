import { NextRequest, NextResponse } from "next/server";
import { findFullDriver } from "@/lib/auth";
import { updateDriver } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Driver self-service shift toggle. Mirrors the admin-side toggle in
// /admin so a driver can flip themselves off-shift mid-shift (break,
// going home) without an admin in the loop. SMS to that driver pauses
// until they flip back on.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const driver = await findFullDriver(body.passcode);
  if (!driver) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const updated = await updateDriver(driver.id, { onShift: Boolean(body.onShift) });
  return NextResponse.json({ ok: true, driver: updated });
}
