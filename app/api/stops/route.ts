import { NextRequest, NextResponse } from "next/server";
import { setStopStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Driver-only: advance a stop's status.
// Body: { id: string, status: "enroute" | "picked-up" | "dropped-off" | "cancelled", passcode: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const expected = process.env.DRIVER_PASSCODE;
  if (!expected || body.passcode !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
