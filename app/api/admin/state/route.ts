import { NextRequest, NextResponse } from "next/server";
import { getDrivers, getSettings, getState } from "@/lib/store";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pass =
    req.headers.get("x-admin-passcode") ?? new URL(req.url).searchParams.get("passcode");
  if (!isAdmin(pass)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [settings, drivers, state] = await Promise.all([getSettings(), getDrivers(), getState()]);

  // "Today" runs from local midnight to now. For an island operation
  // running a single shift, this is the most useful window — anything
  // older the admin generally doesn't care about.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = state.stops.filter((s) => s.createdAt >= todayStart.getTime());

  return NextResponse.json({
    settings,
    drivers,
    today,
    legacyDriverEnabled: Boolean(process.env.DRIVER_PASSCODE),
    shuttle: state.shuttle,
  });
}
