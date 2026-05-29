import webpush from "web-push";
import { getPushSubscriptions, removePushSubscription } from "./store";

// Web Push (VAPID) helper. The driver PWA subscribes via the browser's
// PushManager and POSTs the subscription to /api/push/subscribe. This
// module is the send side — invoked from /api/ping in parallel with
// Twilio SMS so we can decommission SMS once push is proven.

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function ensureConfigured() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Fan-out to every push subscription belonging to a driver in `driverIds`
// (typically the on-shift set). Returns counts so the caller can log
// without parsing per-result objects. Stale subs (410 / 404) are removed
// from the store as a side effect.
export async function sendPushToDrivers(
  driverIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; total: number }> {
  if (!pushConfigured() || driverIds.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }
  ensureConfigured();

  const allSubs = await getPushSubscriptions();
  const targetSubs = allSubs.filter((s) => driverIds.includes(s.driverId));
  if (targetSubs.length === 0) return { sent: 0, failed: 0, total: 0 };

  const json = JSON.stringify(payload);
  const results = await Promise.allSettled(
    targetSubs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, json);
        return { ok: true as const, endpoint: s.subscription.endpoint };
      } catch (err: any) {
        const statusCode = err?.statusCode ?? 0;
        // 404/410 means the subscription is dead at the push service. Drop it.
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(s.subscription.endpoint).catch(() => {});
        }
        return { ok: false as const, endpoint: s.subscription.endpoint, statusCode };
      }
    }),
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) sent++;
    else failed++;
  }
  return { sent, failed, total: targetSubs.length };
}
