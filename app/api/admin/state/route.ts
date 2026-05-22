import { NextRequest, NextResponse } from "next/server";
import { getDrivers, getRideArchive, getSettings, getState, rideDayKey } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { onlineReason } from "@/lib/schedule";
import { smsConfigured } from "@/lib/sms";
import type { Stop } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pass =
    req.headers.get("x-admin-passcode") ?? new URL(req.url).searchParams.get("passcode");
  if (!isAdmin(pass)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const day = rideDayKey();
  const [settings, drivers, state, archive] = await Promise.all([
    getSettings(),
    getDrivers(),
    getState(),
    getRideArchive(day),
  ]);

  // "Today" merges the live queue with the per-day archive (survives
  // state wipes) so completed rides stick around even after a cold start.
  // Live stops win on dedupe — they have the freshest status.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const liveToday = state.stops.filter((s) => s.createdAt >= todayStart.getTime());
  const liveIds = new Set(liveToday.map((s) => s.id));
  const merged: Stop[] = [
    ...archive.filter((s) => !liveIds.has(s.id)),
    ...liveToday,
  ].sort((a, b) => a.createdAt - b.createdAt);

  return NextResponse.json({
    settings,
    drivers,
    today: merged,
    legacyDriverEnabled: Boolean(process.env.DRIVER_PASSCODE),
    smsConfigured: smsConfigured(),
    shuttle: state.shuttle,
    onlineReason: onlineReason(settings),
  });
}
