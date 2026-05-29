import { NextRequest, NextResponse } from "next/server";
import { findFullDriver } from "@/lib/auth";
import { removePushSubscription } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const driver = await findFullDriver(body.passcode);
  if (!driver) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  await removePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
