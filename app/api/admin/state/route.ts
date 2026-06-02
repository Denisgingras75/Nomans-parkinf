import { NextRequest, NextResponse } from "next/server";
import {
  getBouncieDebug,
  isKvConfigured,
  getDrivers,
  getManagers,
  getRideArchive,
  getSettings,
  getState,
  rideDayKey,
} from "@/lib/store";
import { isAdmin, isBootstrap } from "@/lib/auth";
import { onlineReason } from "@/lib/schedule";
import { pushConfigured } from "@/lib/push";
import type { Stop } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pass =
    req.headers.get("x-admin-passcode") ?? new URL(req.url).searchParams.get("passcode");
  if (!(await isAdmin(pass))) {
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

  const bootstrap = isBootstrap(pass);
  const managers = bootstrap ? await getManagers() : undefined;

  // Bouncie / live-GPS connection health, so the owner gets *feedback* in the
  // UI instead of having to curl the hidden /api/admin/bouncie-debug route.
  // We surface a safe fingerprint of the configured secret (head/tail only),
  // the optional vehicle filter, and a summary of the most recent webhook hit
  // so any broken link in the chain (URL → secret → vehicle filter → parser)
  // is visible at a glance.
  const debug = await getBouncieDebug();
  const secret = process.env.BOUNCIE_WEBHOOK_SECRET;
  const lastHit = debug[0] ?? null;
  const bouncie = {
    secretSet: Boolean(secret),
    secretHint: secret ? `${secret.slice(0, 4)}…${secret.slice(-4)}` : null,
    kvConfigured: isKvConfigured(),
    vehicleFilter: process.env.SHUTTLE_VEHICLE_ID ?? null,
    recentHits: debug.length,
    lastHit: lastHit
      ? {
          receivedAt: lastHit.receivedAt,
          secretOk: lastHit.secretOk,
          hadBody: lastHit.hadBody,
          vehicleId: lastHit.vehicleId,
          gotCoords: lastHit.parsed.lat != null && lastHit.parsed.lng != null,
        }
      : null,
  };

  return NextResponse.json({
    settings,
    drivers,
    today: merged,
    legacyDriverEnabled: Boolean(process.env.DRIVER_PASSCODE),
    pushConfigured: pushConfigured(),
    shuttles: state.shuttles,
    onboard: state.onboard,
    capacity: state.capacity,
    onlineReason: onlineReason(settings),
    isBootstrap: bootstrap,
    managers,
    bouncie,
  });
}
