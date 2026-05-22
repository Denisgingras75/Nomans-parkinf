import { NextRequest, NextResponse } from "next/server";
import { addDriver, removeDriver, updateDriver } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gate(req: NextRequest): NextResponse | null {
  if (!isAdmin(req.headers.get("x-admin-passcode"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const gated = gate(req);
  if (gated) return gated;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  let phone: string | null = null;
  if (body?.phone) {
    phone = normalizePhone(String(body.phone));
    if (!phone) {
      return NextResponse.json(
        { error: "phone number looks invalid — try e.g. 508-555-1234" },
        { status: 400 },
      );
    }
  }
  const driver = await addDriver({ name, phone });
  return NextResponse.json({ ok: true, driver });
}

export async function PATCH(req: NextRequest) {
  const gated = gate(req);
  if (gated) return gated;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: { phone?: string | null; onShift?: boolean; name?: string } = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.onShift !== undefined) patch.onShift = Boolean(body.onShift);
  if (body.phone !== undefined) {
    if (body.phone === null || body.phone === "") {
      patch.phone = null;
    } else {
      const normalized = normalizePhone(String(body.phone));
      if (!normalized) {
        return NextResponse.json({ error: "phone looks invalid" }, { status: 400 });
      }
      patch.phone = normalized;
    }
  }

  const updated = await updateDriver(id, patch);
  if (!updated) return NextResponse.json({ error: "driver not found" }, { status: 404 });
  return NextResponse.json({ ok: true, driver: updated });
}

export async function DELETE(req: NextRequest) {
  const gated = gate(req);
  if (gated) return gated;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await removeDriver(id);
  if (!ok) return NextResponse.json({ error: "driver not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
