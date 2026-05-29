"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/types";
import { createChimeContext, playChime } from "@/lib/chime";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type Stop = {
  id: string;
  kind: "pickup" | "dropoff";
  partySize: number;
  status: "queued" | "enroute" | "picked-up" | "dropped-off" | "cancelled";
  position: LatLng;
  name?: string;
  note?: string;
  phone?: string | null;
};

type StateResponse = {
  shuttle: {
    position: LatLng | null;
    heading: number | null;
    speedMph: number | null;
    updatedAt: number | null;
    onboard: number;
    capacity: number;
  };
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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const knownPickupIdsRef = useRef<Set<string>>(new Set());
  const alertPrimedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
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
  const queued = stops.filter((s) => s.status === "queued" || s.status === "enroute");
  const shuttle = state?.shuttle.position ?? null;
  const shuttleHeading = state?.shuttle.heading ?? null;
  const shuttleSpeedMph = state?.shuttle.speedMph ?? null;
  const nomans = state?.nomans ?? { lat: 41.4541, lng: -70.5605 };
  const updatedAgo =
    state?.shuttle.updatedAt != null ? Math.round((Date.now() - state.shuttle.updatedAt) / 1000) : null;

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
              {state?.shuttle.onboard ?? 0}/{state?.shuttle.capacity ?? 8}
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
            return (
              <div key={s.id} className="stop">
                <div className="stop-head">
                  <div>
                    <span className={`tag ${s.kind}`}>{s.kind}</span>{" "}
                    <strong>{s.name ?? "Guest"}</strong>{" "}
                    <span className="note">× {s.partySize}</span>
                  </div>
                  <span className={`tag ${s.status === "enroute" ? "enroute" : "queued"}`}>{s.status}</span>
                </div>
                {s.note && <div className="note">&ldquo;{s.note}&rdquo;</div>}
                {s.phone && (
                  <div className="stop-actions">
                    <a className="contact-link" href={`tel:${s.phone}`}>📞 Call {s.phone}</a>
                    <a className="contact-link" href={`sms:${s.phone}`}>💬 Text</a>
                  </div>
                )}
                <div className="stop-actions">
                  <a className="nav-link" href={navUrl} target="_blank" rel="noopener noreferrer">
                    🧭 Navigate
                  </a>
                  {s.status === "queued" && (
                    <button onClick={() => advance(s.id, "enroute")}>Mark en route</button>
                  )}
                  {s.kind === "pickup" && s.status !== "picked-up" && (
                    <button className="ok" onClick={() => advance(s.id, "picked-up")}>
                      Picked up
                    </button>
                  )}
                  {s.kind === "dropoff" && (
                    <button className="ok" onClick={() => advance(s.id, "dropped-off")}>
                      Dropped off
                    </button>
                  )}
                  <button className="secondary" onClick={() => advance(s.id, "cancelled")}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <h2>Map</h2>
          <Map shuttle={shuttle} shuttleHeading={shuttleHeading} shuttleSpeedMph={shuttleSpeedMph} nomans={nomans} stops={queued} className="map map-driver" />
        </div>
      </div>
    </main>
  );
}
