import { NextRequest, NextResponse } from "next/server";
import { getBouncieDebug, clearBouncieDebug } from "@/lib/store";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostic. Shows the last few raw Bouncie webhook payloads so we
// can confirm the parser against Bouncie's real JSON shape. Open in a browser:
//   /api/admin/bouncie-debug?passcode=YOUR_ADMIN_PASSCODE
// Add &clear=1 to wipe the captured log between test runs.
// Remove this route + the debug plumbing in lib/store.ts + the webhook once
// live GPS is confirmed.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pass = req.headers.get("x-admin-passcode") ?? url.searchParams.get("passcode");
  if (!(await isAdmin(pass))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (url.searchParams.get("clear") === "1") {
    await clearBouncieDebug();
    return NextResponse.json({ ok: true, cleared: true });
  }

  const entries = await getBouncieDebug();
  return NextResponse.json({
    count: entries.length,
    hint:
      entries.length === 0
        ? "No webhook hits captured yet. If this stays empty while a van drives, Bouncie isn't reaching this URL at all (check the webhook URL/enabled in the Bouncie portal)."
        : "secretOk:false ⇒ wrong secret in the Bouncie URL. hadBody:true + parsed lat/lng null ⇒ payload shape the parser doesn't read; send me the 'raw' field.",
    entries,
  });
}
