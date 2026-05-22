"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/types";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type Stop = {
  id: string;
  kind: "pickup" | "dropoff";
  partySize: number;
  status: "queued" | "enroute" | "picked-up" | "dropped-off" | "cancelled";
  position: LatLng;
  name?: string;
  note?: string;
};

type StateResponse = {
  shuttle: { position: LatLng | null; updatedAt: number | null; onboard: number; capacity: number };
  stops: Stop[];
  nomans: LatLng;
};

export default function DriverPage() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("nomans.driverPass");
    if (saved) {
      setPasscode(saved);
      setAuthed(true);
    }
  }, []);

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
        /* ignore transient errors */
      }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [authed, passcode]);

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

  if (!authed) {
    return (
      <main className="page">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <div className="brand-name">Driver dashboard</div>
            <div className="brand-sub">NoMans combi</div>
          </div>
        </div>
        <div className="card">
          <label htmlFor="pass">Driver passcode</label>
          <input
            id="pass"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Set in your env file"
          />
          <button
            style={{ marginTop: 12 }}
            onClick={() => {
              localStorage.setItem("nomans.driverPass", passcode);
              setAuthed(true);
            }}
          >
            Unlock
          </button>
        </div>
      </main>
    );
  }

  const stops = state?.stops ?? [];
  const queued = stops.filter((s) => s.status === "queued" || s.status === "enroute");
  const shuttle = state?.shuttle.position ?? null;
  const nomans = state?.nomans ?? { lat: 41.4541, lng: -70.5605 };
  const updatedAgo =
    state?.shuttle.updatedAt != null ? Math.round((Date.now() - state.shuttle.updatedAt) / 1000) : null;

  return (
    <main className="driver-page">
      <div className="brand">
        <div className="brand-mark">N</div>
        <div>
          <div className="brand-name">Driver dashboard</div>
          <div className="brand-sub">
            {updatedAgo == null
              ? "No Bouncie signal yet"
              : updatedAgo < 60
              ? `Position fresh (${updatedAgo}s ago)`
              : `Stale signal — ${Math.round(updatedAgo / 60)} min old`}
          </div>
        </div>
      </div>

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

      {error && <div className="card" style={{ borderColor: "var(--danger)" }}><div className="error">{error}</div></div>}

      <div className="driver-grid">
        <div>
          <h2>Queue</h2>
          {queued.length === 0 && <div className="card note">Nothing queued. Cruise the loop.</div>}
          {queued.map((s) => (
            <div key={s.id} className="stop">
              <div className="stop-head">
                <div>
                  <span className={`tag ${s.kind}`}>{s.kind}</span>{" "}
                  <strong>{s.name ?? "Guest"}</strong>{" "}
                  <span className="note">× {s.partySize}</span>
                </div>
                <span className={`tag ${s.status === "enroute" ? "enroute" : "queued"}`}>{s.status}</span>
              </div>
              {s.note && <div className="note">"{s.note}"</div>}
              <div className="stop-actions">
                {s.status === "queued" && (
                  <button onClick={() => advance(s.id, "enroute")}>Mark en route</button>
                )}
                {s.kind === "pickup" && s.status !== "picked-up" && (
                  <button className="ok" onClick={() => advance(s.id, "picked-up")}>Picked up</button>
                )}
                {s.kind === "dropoff" && (
                  <button className="ok" onClick={() => advance(s.id, "dropped-off")}>Dropped off</button>
                )}
                <button className="secondary" onClick={() => advance(s.id, "cancelled")}>Cancel</button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h2>Map</h2>
          <Map
            shuttle={shuttle}
            nomans={nomans}
            stops={queued}
            className="map map-driver"
          />
        </div>
      </div>
    </main>
  );
}
