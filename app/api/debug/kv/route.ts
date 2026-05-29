import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-debug-key") !== process.env.ADMIN_PASSCODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = await kv.get("nomans:state:v1");
  const stateRouteSaw = await kv.get("nomans:debug:state-route-saw");
  const stateRouteErr = await kv.get("nomans:debug:state-route-error");

  return NextResponse.json({
    kv_url: process.env.KV_REST_API_URL?.slice(0, 40),
    state_value: state,
    state_route_saw: stateRouteSaw,
    state_route_error: stateRouteErr,
  });
}
