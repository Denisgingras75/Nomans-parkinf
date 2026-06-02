// Phone-number normalization. (Driver alerts are push-only now — see
// lib/push.ts — so there's no SMS sender here anymore; this module just keeps
// the phone helper that /api/ping and the admin driver/manager routes use to
// store numbers in a consistent shape for tap-to-call.)

// Normalize US/international phone input → E.164. Returns null if too
// few digits to be a real number. We don't try to be clever — bad
// numbers just won't be call-able and the admin can fix them.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8) return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
  return null;
}
