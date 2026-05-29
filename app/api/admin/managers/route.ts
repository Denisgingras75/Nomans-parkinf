import { NextRequest, NextResponse } from "next/server";
import { addManager, removeManager } from "@/lib/store";
import { isBootstrap } from "@/lib/auth";
import { normalizePhone } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manager mgmt is bootstrap-only. Managers themselves can do everything
// in /admin except add/remove other managers — that stays a Denis-only
// (env-var-passcode) action so a compromised manager can't elevate.
function gate(req: NextRequest): NextResponse | null {
  if (!isBootstrap(req.headers.get("x-admin-passcode"))) {
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

  const manager = await addManager({ name, phone });
  return NextResponse.json({ ok: true, manager });
}

export async function DELETE(req: NextRequest) {
  const gated = gate(req);
  if (gated) return gated;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await removeManager(id);
  if (!ok) return NextResponse.json({ error: "manager not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
