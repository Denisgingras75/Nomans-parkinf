import { NextRequest, NextResponse } from "next/server";
import { updateSettings } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { parseHHMM } from "@/lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const pass = req.headers.get("x-admin-passcode");
  if (!(await isAdmin(pass))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.nomans && typeof body.nomans === "object") {
    const lat = Number((body.nomans as any).lat);
    const lng = Number((body.nomans as any).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      patch.nomans = { lat, lng };
    }
  }

  if (body.bounds && typeof body.bounds === "object") {
    const b = body.bounds as any;
    const south = Number(b.south);
    const north = Number(b.north);
    const west = Number(b.west);
    const east = Number(b.east);
    if ([south, north, west, east].every(Number.isFinite) && south < north && west < east) {
      patch.bounds = { south, north, west, east };
    } else {
      return NextResponse.json(
        { error: "bounds must have south < north and west < east" },
        { status: 400 },
      );
    }
  }

  if (body.capacity !== undefined) {
    const c = Number(body.capacity);
    if (!Number.isFinite(c) || c < 1 || c > 32) {
      return NextResponse.json({ error: "capacity must be 1–32" }, { status: 400 });
    }
    patch.capacity = Math.round(c);
  }

  if (body.online !== undefined) patch.online = Boolean(body.online);
  if (body.alertsEnabled !== undefined) patch.alertsEnabled = Boolean(body.alertsEnabled);

  if (body.hours && typeof body.hours === "object") {
    const h = body.hours as any;
    const open = typeof h.open === "string" ? h.open : "";
    const close = typeof h.close === "string" ? h.close : "";
    if (parseHHMM(open) === null || parseHHMM(close) === null) {
      return NextResponse.json(
        { error: "hours.open and hours.close must be HH:MM (24h)" },
        { status: 400 },
      );
    }
    patch.hours = { enabled: Boolean(h.enabled), open, close };
  }

  const updated = await updateSettings(patch);
  return NextResponse.json({ ok: true, settings: updated });
}
