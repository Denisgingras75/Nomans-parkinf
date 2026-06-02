"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/types";
import { createChimeContext, playChime } from "@/lib/chime";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type Stop = {
  id: string;
  rideId?: string;
  kind: "pickup" | "dropoff";
  partySize: number;
  status: "queued" | "accepted" | "enroute" | "picked-up" | "dropped-off" | "cancelled";
  position: LatLng;
  name?: string;
  note?: string;
  phone?: string | null;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
};

type ShuttleFeed = {
  id: string;
  label: string | null;
  position: LatLng | null;
  heading: number | null;
  speedMph: number | null;
  updatedAt: number | null;
};

type StateResponse = {
  shuttles: ShuttleFeed[];
  onboard: number;
  capacity: number;
  stops: Stop[];
  nomans: LatLng;
  me: { id: string; name: string; onShift: boolean; phone: string | null } | null;
};

export default function DriverPage() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [shiftToggling, setShiftToggling] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    "unknown" | "unsupported" | "denied" | "off" | "on" | "working"
  >("unknown");
  const [pushError, setPushError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const knownPickupIdsRef = useRef<Set<string>>(new Set());
  const alertPrimedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Deep-link from a /admin QR code: ?code=NM-XXXXXX → auto-fill +
    // unlock, then strip the param from the URL so it doesn't linger
    // in history or bookmarks.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code && code.startsWith("NM-")) {
      setPasscode(code);
      audioCtxRef.current = createChimeContext();
      localStorage.setItem("nomans.driverPass", code);
      setAuthed(true);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
      return;
    }
    const saved = localStorage.getItem("nomans.driverPass");
    if (saved) {
      setPasscode(saved);
      setAuthed(true);
    }
  }, []);

  // Poll state every 4s while authenticated.
  useEffect(() => {
    if (!authed) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/state?driver=${encodeURIComponent(passcode)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StateResponse;
        if (alive) setState(data);
      } catch {
        /* transient — retry next tick */
      }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [authed, passcode]);

  // Detect new pickup pings → chime + flash. The first state load
  // doesn't trigger an alert — queue items present on unlock are
  // treated as already known.
  useEffect(() => {
    if (!state) return;
    const incomingIds = new Set(
      state.stops.filter((s) => s.kind === "pickup").map((s) => s.id),
    );
    if (alertPrimedRef.current) {
      const previous = knownPickupIdsRef.current;
      const fresh = [...incomingIds].filter((id) => !previous.has(id));
      if (fresh.length > 0) {
        playChime(audioCtxRef.current);
        triggerFlash();
      }
    }
    knownPickupIdsRef.current = incomingIds;
    alertPrimedRef.current = true;
  }, [state]);

  const triggerFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };

  const unlock = () => {
    audioCtxRef.current = createChimeContext();
    localStorage.setItem("nomans.driverPass", passcode);
    setAuthed(true);
  };

  const toggleShift = async () => {
    if (!state?.me) return;
    setShiftToggling(true);
    try {
      const res = await fetch("/api/driver/shift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode, onShift: !state.me.onShift }),
      });
      if (res.ok) {
        const data = await res.json();
        setState((prev) =>
          prev && prev.me
            ? { ...prev, me: { ...prev.me, onShift: Boolean(data.driver?.onShift) } }
            : prev,
        );
      }
    } finally {
      setShiftToggling(false);
    }
  };

  // ----- Web Push -----
  const checkPushStatus = async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        setPushStatus("off");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setPushStatus(sub ? "on" : "off");
    } catch {
      setPushStatus("off");
    }
  };

  useEffect(() => {
    if (!authed) return;
    checkPushStatus();
  }, [authed]);

  const enablePush = async () => {
    setPushError(null);
    setPushStatus("working");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus("unsupported");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushStatus(perm === "denied" ? "denied" : "off");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setPushError("Server-side push key missing.");
        setPushStatus("off");
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode, subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setPushError(j.error ?? "Server rejected the subscription.");
        setPushStatus("off");
        return;
      }
      setPushStatus("on");
    } catch (e: any) {
      setPushError(e?.message ?? "Couldn't enable alerts.");
      setPushStatus("off");
    }
  };

  const disablePush = async () => {
    setPushError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passcode, endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setPushStatus("off");
    } catch (e: any) {
      setPushError(e?.message ?? "Couldn't disable.");
    }
  };

  const advance = async (id: string, status: Stop["status"]) => {
    setError(null);
    const res = await fetch("/api/stops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status, passcode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed");
    }
  };

  // Accept (claim) or decline a whole ride — both legs move together.
  // Returns whether the action succeeded so callers can chain off it.
  const claim = async (rideId: string | undefined, action: "accept" | "decline"): Promise<boolean> => {
    if (!rideId) return false;
    setError(null);
    const res = await fetch("/api/stops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, rideId, passcode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed");
      return false;
    }
    return true;
  };

  // Accept a ride and hand off to the phone's maps app with turn-by-turn to
  // the pickup. We open the directions URL *synchronously* inside the tap —
  // the old "open blank tab, redirect after the claim resolves" trick was
  // getting popup-blocked on mobile (window.open returned null), so the map
  // never opened even though the claim itself succeeded. A direct
  // user-gesture navigation to the real URL isn't blocked. The claim runs in
  // parallel; if it fails the card surfaces the error and stays put.
  const acceptAndNavigate = (rideId: string | undefined, navUrl: string) => {
    if (typeof window !== "undefined") window.open(navUrl, "_blank", "noopener");
    claim(rideId, "accept");
  };

  // ----- Driver-phone GPS broadcast -----
  const startBroadcast = () => {
    setBroadcastError(null);
    if (!navigator.geolocation) {
      setBroadcastError("This browser can't share location.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await fetch("/api/driver/location", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
              passcode,
            }),
          });
        } catch {
          /* one missed update is fine, the next watchPosition fix retries */
        }
      },
      (err) => setBroadcastError(err.message || "Location error"),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
    watchIdRef.current = id;
    setBroadcasting(true);
    localStorage.setItem("nomans.broadcast", "1");
  };

  const stopBroadcast = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setBroadcasting(false);
    localStorage.setItem("nomans.broadcast", "0");
  };

  // Resume broadcast across reloads if it was on before.
  useEffect(() => {
    if (!authed) return;
    if (localStorage.getItem("nomans.broadcast") === "1") startBroadcast();
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return (
      <main className="page">
        <header className="brand">
          <img src="/nomans-logo.png" alt="NoMans" className="brand-logo" />
          <div className="brand-tag">Driver Dashboard</div>
        </header>
        <div className="card">
          <label htmlFor="pass">Driver passcode</label>
          <input
            id="pass"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Set in your Vercel env vars"
          />
          <button style={{ marginTop: 12 }} onClick={unlock}>
            Unlock
          </button>
          <p className="note" style={{ marginTop: 12 }}>
            Tapping Unlock also primes the chime sound (iOS Safari requires it).
          </p>
        </div>
      </main>
    );
  }

  const stops = state?.stops ?? [];
  // Include "accepted" — a ride the driver just claimed must stay in their
  // queue so they can mark en route / picked up / release it. Leaving it out
  // made claimed rides vanish the instant Accept was tapped.
  const queued = stops.filter(
    (s) => s.status === "queued" || s.status === "accepted" || s.status === "enroute",
  );
  const shuttles = (state?.shuttles ?? []).filter(
    (s): s is ShuttleFeed & { position: LatLng } => s.position != null,
  );
  const nomans = state?.nomans ?? { lat: 41.4541, lng: -70.5605 };
  const newestUpdate = shuttles.reduce<number | null>(
    (max, s) => (s.updatedAt != null && (max == null || s.updatedAt > max) ? s.updatedAt : max),
    null,
  );
  const updatedAgo = newestUpdate != null ? Math.round((Date.now() - newestUpdate) / 1000) : null;

  return (
    <main className="driver-page">
      <div className={`flash-overlay${flash ? " on" : ""}`} aria-hidden />

      <header className="brand">
        <img src="/nomans-logo.png" alt="NoMans" className="brand-logo" />
        <div className="brand-tag">
          Driver Dashboard ·{" "}
          {updatedAgo == null
            ? "no signal yet"
            : updatedAgo < 60
            ? `position fresh (${updatedAgo}s)`
            : `stale (${Math.round(updatedAgo / 60)} min)`}
        </div>
      </header>

      <div className="card">
        <div className="kpi">
          <div>
            <div className="num">
              {state?.onboard ?? 0}/{state?.capacity ?? 8}
            </div>
            <div className="lbl">On board</div>
          </div>
          <div>
            <div className="num">{queued.filter((s) => s.kind === "pickup").length}</div>
            <div className="lbl">Pickups queued</div>
          </div>
          <div>
            <div className="num">{queued.filter((s) => s.kind === "dropoff").length}</div>
            <div className="lbl">Dropoffs queued</div>
          </div>
        </div>
      </div>

      {state?.me && (
        <div
          className="card"
          style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 700 }}>
              {state.me.onShift ? "● On shift" : "○ Off shift"} · {state.me.name}
            </div>
            <div className="note">
              {state.me.onShift
                ? state.me.phone
                  ? "You'll get SMS on every new pickup."
                  : "On shift, but no phone number on file — no SMS."
                : "Off shift — no SMS until you flip back on."}
            </div>
          </div>
          <button
            className={state.me.onShift ? "danger" : "ok"}
            onClick={toggleShift}
            disabled={shiftToggling}
            style={{ width: "auto" }}
          >
            {state.me.onShift ? "Go off shift" : "Go on shift"}
          </button>
        </div>
      )}

      <div
        className="card"
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700 }}>Phone alerts (push)</div>
          <div className="note">
            {pushStatus === "on"
              ? "This phone gets a push notification (with sound + vibrate) on every new pickup, even when this page is closed."
              : pushStatus === "denied"
              ? "Notifications are blocked. Open Settings → Notifications → Allow for this site."
              : pushStatus === "unsupported"
              ? "This browser doesn't support push. Try Safari 16.4+ or Chrome on Android."
              : pushStatus === "working"
              ? "Setting up…"
              : "Enable to get pinged like Uber — no SMS, no app store."}
          </div>
          {pushError && <div className="error">{pushError}</div>}
        </div>
        {pushStatus === "on" ? (
          <button className="secondary" onClick={disablePush} style={{ width: "auto" }}>
            Disable
          </button>
        ) : (
          <button
            className="ok"
            onClick={enablePush}
            disabled={pushStatus === "unsupported" || pushStatus === "working"}
            style={{ width: "auto" }}
          >
            {pushStatus === "working" ? "Enabling…" : "Enable phone alerts"}
          </button>
        )}
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700 }}>Broadcast my phone's GPS</div>
          <div className="note">Use this when the Bouncie dongle isn't installed yet.</div>
          {broadcastError && <div className="error">{broadcastError}</div>}
        </div>
        {broadcasting ? (
          <button className="danger" onClick={stopBroadcast} style={{ width: "auto" }}>
            Stop broadcast
          </button>
        ) : (
          <button onClick={startBroadcast} style={{ width: "auto" }}>
            Start broadcast
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="error">{error}</div>
        </div>
      )}

      <div className="driver-grid">
        <div>
          <h2>Queue</h2>
          {queued.length === 0 && <div className="card note">Nothing queued. Cruise the loop.</div>}
          {queued.map((s) => {
            const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.position.lat},${s.position.lng}`;
            const myId = state?.me?.id;
            const mine = !!s.assignedDriverId && s.assignedDriverId === myId;
            const claimedByOther = !!s.assignedDriverId && !mine;
            const unclaimed = !s.assignedDriverId;
            return (
              <div key={s.id} className={`stop${claimedByOther ? " claimed-other" : ""}`}>
                <div className="stop-head">
                  <div>
                    <span className={`tag ${s.kind}`}>{s.kind}</span>{" "}
                    <strong>{s.name ?? "Guest"}</strong>{" "}
                    <span className="note">× {s.partySize}</span>
                  </div>
                  <span className={`tag ${s.status === "queued" ? "queued" : "enroute"}`}>{s.status}</span>
                </div>
                {s.note && <div className="note">&ldquo;{s.note}&rdquo;</div>}

                {claimedByOther ? (
                  <div className="note" style={{ marginTop: 8 }}>
                    🔒 {s.assignedDriverName ?? "Another driver"} has this one.
                  </div>
                ) : (
                  <>
                    {s.phone && mine && (
                      <div className="stop-actions">
                        <a className="contact-link call-link" href={`tel:${s.phone}`}>
                          📞 Call {s.name ?? "passenger"}
                        </a>
                        <a className="contact-link" href={`sms:${s.phone}`}>💬 Text</a>
                      </div>
                    )}
                    <div className="stop-actions">
                      <a className="nav-link" href={navUrl} target="_blank" rel="noopener noreferrer">
                        🧭 Navigate
                      </a>

                      {/* Unclaimed: accept/decline the whole ride from its pickup leg. */}
                      {unclaimed && s.kind === "pickup" && (
                        <>
                          <button className="ok" onClick={() => acceptAndNavigate(s.rideId, navUrl)}>
                            ✅ Accept &amp; navigate
                          </button>
                          <button className="secondary" onClick={() => claim(s.rideId, "decline")}>
                            Decline
                          </button>
                        </>
                      )}

                      {/* My ride: the pickup → dropoff flow + release back to queue. */}
                      {mine && (s.status === "queued" || s.status === "accepted") && (
                        <button onClick={() => advance(s.id, "enroute")}>Mark en route</button>
                      )}
                      {mine && s.kind === "pickup" && s.status !== "picked-up" && (
                        <button className="ok" onClick={() => advance(s.id, "picked-up")}>
                          Picked up
                        </button>
                      )}
                      {mine && s.kind === "dropoff" && (
                        <button className="ok" onClick={() => advance(s.id, "dropped-off")}>
                          Dropped off
                        </button>
                      )}
                      {mine && (
                        <button className="secondary" onClick={() => claim(s.rideId, "decline")}>
                          Release
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <h2>Map</h2>
          <Map shuttles={shuttles} nomans={nomans} stops={queued} className="map map-driver" />
        </div>
      </div>
    </main>
  );
}

// VAPID keys are URL-safe base64. PushManager.subscribe wants a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window === "undefined" ? Buffer.from(base64, "base64").toString("binary") : atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
