import type { Driver } from "./types";

// Twilio Programmable SMS via REST API — no SDK dependency. If any of
// the three env vars is missing, sendSms() is a no-op and returns null,
// so the rest of the app keeps working with alerts silently disabled.
//
// Configuration: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
// TWILIO_FROM (an SMS-capable Twilio number in E.164 format like
// +15085551234) in Vercel env vars.

const PER_MESSAGE_TIMEOUT_MS = 2500;

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM,
  );
}

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { ok: false, error: "twilio not configured" };

  // Override-able for tests / mocks. Default is Twilio's prod API.
  const base = process.env.TWILIO_BASE_URL || "https://api.twilio.com";
  const url = `${base}/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_MESSAGE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `twilio ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// Fan-out helper: send the same message to every on-shift driver who
// has a phone number on file. Errors are logged but swallowed so a
// Twilio outage can't make a passenger's ping fail.
export async function notifyOnShiftDrivers(drivers: Driver[], body: string): Promise<void> {
  if (!smsConfigured()) return;
  const targets = drivers.filter((d) => d.onShift && d.phone);
  if (targets.length === 0) return;
  const results = await Promise.allSettled(
    targets.map((d) => sendSms(d.phone as string, body)),
  );
  for (const r of results) {
    if (r.status === "rejected") console.error("sms send failed:", r.reason);
    else if (!r.value.ok) console.error("sms send failed:", r.value.error);
  }
}

// Normalize US/international phone input → E.164. Returns null if too
// few digits to be a real number. We don't try to be clever — bad
// numbers will fail at send time and the admin can fix them.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8) return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
  return null;
}
