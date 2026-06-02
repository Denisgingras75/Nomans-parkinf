import { NextRequest, NextResponse } from "next/server";
import { getDrivers } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { pushConfigured, sendPushToDrivers } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-triggered "is push working?" probe. Sends a clearly-labeled test
// notification to every on-shift driver who has enabled phone alerts, so the
// owner can verify the push path before a real passenger pings.
export async function POST(req: NextRequest) {
  const pass = req.headers.get("x-admin-passcode");
  if (!(await isAdmin(pass))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "Push not configured — set VAPID_* env vars in Vercel.", code: "no_vapid" },
      { status: 503 },
    );
  }

  const drivers = await getDrivers();
  const onShiftIds = drivers.filter((d) => d.onShift).map((d) => d.id);
  if (onShiftIds.length === 0) {
    return NextResponse.json(
      { error: "No on-shift drivers.", code: "no_targets" },
      { status: 422 },
    );
  }

  const result = await sendPushToDrivers(onShiftIds, {
    title: "🚐 NoMans Combi — test",
    body: "Test alert from /admin. If you got this, push is working — no action needed.",
    url: "/driver",
    tag: "nomans-test",
  });

  // result.total is how many push subscriptions we actually had for on-shift
  // drivers — zero means nobody has tapped "Enable phone alerts" yet.
  if (result.total === 0) {
    return NextResponse.json(
      {
        error:
          "No on-shift driver has enabled phone alerts yet. Have them open /driver and tap “Enable phone alerts”.",
        code: "no_subs",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: result.failed === 0,
    sent: result.sent,
    failed: result.failed,
    total: result.total,
  });
}
