import type { ServiceHours, Settings } from "./types";

// Server runs in UTC on Vercel; the bar runs on Eastern. Always evaluate
// the schedule against America/New_York so daylight-saving handles itself.
export const NOMANS_TZ = "America/New_York";

export const DEFAULT_HOURS: ServiceHours = {
  enabled: false,
  open: "17:00",
  close: "23:00",
};

// True if the combi is effectively online right now. Manual offline always
// wins (kill-switch). When hours are disabled or unparsable, fall through
// to the manual flag so a typo can't lock out service.
export function isOnlineNow(settings: Settings, now: Date = new Date()): boolean {
  if (!settings.online) return false;
  const hours = settings.hours ?? DEFAULT_HOURS;
  if (!hours.enabled) return true;
  const open = parseHHMM(hours.open);
  const close = parseHHMM(hours.close);
  if (open === null || close === null) return true;
  return inWindow(localMinutes(now, NOMANS_TZ), open, close);
}

// "schedule" = the schedule is blocking; "manual" = admin took it down;
// "open" = currently serving.
export function onlineReason(
  settings: Settings,
  now: Date = new Date(),
): "open" | "manual" | "schedule" {
  if (!settings.online) return "manual";
  if (isOnlineNow(settings, now)) return "open";
  return "schedule";
}

export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function localMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  let h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (h === 24) h = 0; // some Node Intl impls return 24 at midnight
  return h * 60 + m;
}

function inWindow(now: number, open: number, close: number): boolean {
  if (close === open) return false;
  if (close > open) return now >= open && now < close;
  // wraps past midnight (e.g. open 17:00, close 02:00)
  return now >= open || now < close;
}
