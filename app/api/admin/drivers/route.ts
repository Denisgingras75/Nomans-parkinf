import { NextRequest, NextResponse } from "next/server";
import { addDriver, removeDriver } from "@/lib/store";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const pass = req.headers.get("x-admin-passcode");
  if (!isAdmin(pass)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 40);
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const driver = await addDriver(name);
  return NextResponse.json({ ok: true, driver });
}

export async function DELETE(req: NextRequest) {
  const pass = req.headers.get("x-admin-passcode");
  if (!isAdmin(pass)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = await removeDriver(id);
  if (!ok) {
    return NextResponse.json({ error: "driver not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
