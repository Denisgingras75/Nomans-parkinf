import { NextRequest, NextResponse } from "next/server";
import { getDrivers } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { sendSms, smsConfigured } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-triggered "is SMS working?" probe. Sends a clearly-labeled test
// message to every on-shift driver who has a phone number, so the owner
// can verify the Twilio path before a real passenger pings.
export async function POST(req: NextRequest) {
  const pass = req.headers.get("x-admin-passcode");
  if (!(await isAdmin(pass))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!smsConfigured()) {
    return NextResponse.json(
      { error: "Twilio not configured — set TWILIO_* env vars in Vercel.", code: "no_twilio" },
      { status: 503 },
    );
  }

  const drivers = await getDrivers();
  const targets = drivers.filter((d) => d.onShift && d.phone);
  if (targets.length === 0) {
    return NextResponse.json(
      { error: "No on-shift drivers with a phone number on file.", code: "no_targets" },
      { status: 422 },
    );
  }

  const body =
    "🚐 NoMans Combi: TEST PING from /admin. If you got this, alerts are working — no action needed.";

  // Don't use notifyOnShiftDrivers (it swallows results) — we want per-driver
  // status so the owner sees who got it and who failed.
  const results = await Promise.all(
    targets.map(async (d) => {
      const r = await sendSms(d.phone as string, body);
      return { name: d.name, phone: d.phone as string, ok: r.ok, error: r.error };
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  return NextResponse.json({
    ok: failed === 0,
    sent,
    failed,
    total: results.length,
    results,
  });
}
