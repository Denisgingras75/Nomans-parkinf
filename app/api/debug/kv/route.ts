import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Temporary diagnostic — set/get a sentinel key and report what
// @vercel/kv actually does. Gated on x-debug-key header so this isn't
// open to the public.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-debug-key") !== process.env.ADMIN_PASSCODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report: Record<string, unknown> = {
    kv_url_present: Boolean(process.env.KV_REST_API_URL),
    kv_token_present: Boolean(process.env.KV_REST_API_TOKEN),
    kv_url_host: process.env.KV_REST_API_URL
      ? new URL(process.env.KV_REST_API_URL).host
      : null,
  };

  try {
    const { kv } = await import("@vercel/kv");
    const sentinel = `debug-${Date.now()}`;
    await kv.set("nomans:debug:probe", sentinel);
    const readback = await kv.get<string>("nomans:debug:probe");
    report.set_ok = true;
    report.readback_matches = readback === sentinel;
    report.readback_value = readback;

    // Also probe the actual state key
    const state = await kv.get("nomans:state:v1");
    report.state_key_present = state !== null;
    report.state_value = state;
  } catch (err: any) {
    report.error = err?.message ?? String(err);
    report.error_stack = err?.stack?.split("\n").slice(0, 5);
  }

  return NextResponse.json(report);
}
