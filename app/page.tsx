"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/types";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type StateResponse = {
  shuttle: { position: LatLng | null; updatedAt: number | null; onboard: number; capacity: number };
  stops: { id: string; kind: "pickup" | "dropoff"; position: LatLng; status: string }[];
  nomans: LatLng;
  yours: { etaMinutes: number | null; position: number; status: string } | null;
};

type Direction = "to-nomans" | "from-nomans";

export default function PassengerPage() {
  const [direction, setDirection] = useState<Direction>("to-nomans");
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState("");
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [state, setState] = useState<StateResponse | null>(null);

  // Restore prior ping from localStorage so a reload doesn't lose the ETA.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("nomans.stopId") : null;
    if (saved) setStopId(saved);
  }, []);

  useEffect(() => {
    if (stopId) localStorage.setItem("nomans.stopId", stopId);
  }, [stopId]);

  // Poll state every 5s.
  useEffect(() => {
    let alive = true;
    const fetchState = async () => {
      const q = stopId ? `?stopId=${encodeURIComponent(stopId)}` : "";
      try {
        const res = await fetch(`/api/state${q}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StateResponse;
        if (alive) setState(data);
      } catch {
        /* network blip — try again on next tick */
      }
    };
    fetchState();
    const t = setInterval(fetchState, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [stopId]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocError("Your browser doesn't support location sharing.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocError(err.message || "Couldn't get your location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const submit = async () => {
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError("Tell us your name so the driver can find you.");
      return;
    }
    if (!me) {
      setSubmitError("Share your location first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, partySize, note, direction, position: me }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Couldn't request the shuttle.");
      } else {
        setStopId(data.stopId);
      }
    } catch (e) {
      setSubmitError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => {
    setStopId(null);
    localStorage.removeItem("nomans.stopId");
  };

  const yours = state?.yours;
  const shuttle = state?.shuttle.position ?? null;
  const nomans = state?.nomans ?? { lat: 41.4541, lng: -70.5605 };
  const lastUpdateSec = state?.shuttle.updatedAt
    ? Math.max(0, Math.round((Date.now() - state.shuttle.updatedAt) / 1000))
    : null;

  return (
    <main className="page">
      <header className="brand">
        <img src="/nomans-logo.png" alt="NoMans · Martha's Vineyard" className="brand-logo" />
        <div className="brand-tag">Oak Bluffs Combi Shuttle</div>
      </header>

      {stopId && yours ? (
        <div className="eta-card">
          <div className="label">{yours.status === "picked-up" ? "On board" : "Combi inbound"}</div>
          <div className="big">
            {yours.etaMinutes != null ? `${yours.etaMinutes} min` : "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {yours.status === "picked-up"
              ? "Sit tight — heading to your dropoff."
              : `You're #${yours.position} in the queue.`}
          </div>
        </div>
      ) : null}

      {!stopId && (
        <div className="card">
          <h1>Where to?</h1>
          <p className="note">Heavy traffic? Skip the walk. Ping the combi.</p>

          <div className="toggle" style={{ margin: "12px 0" }}>
            <button
              type="button"
              className={direction === "to-nomans" ? "active" : ""}
              onClick={() => setDirection("to-nomans")}
            >
              To NoMans
            </button>
            <button
              type="button"
              className={direction === "from-nomans" ? "active" : ""}
              onClick={() => setDirection("from-nomans")}
            >
              From NoMans
            </button>
          </div>

          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="So the driver knows who to pick up" />

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="party">Party size</label>
              <select id="party" value={partySize} onChange={(e) => setPartySize(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "person" : "people"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label htmlFor="note" style={{ marginTop: 12 }}>
            Note for driver (optional)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={direction === "to-nomans" ? "e.g. corner of Circuit & Kennebec" : "e.g. drop us at the Wesley House"}
          />

          <div style={{ marginTop: 12 }}>
            {me ? (
              <div className="note">
                {direction === "to-nomans"
                  ? `Pickup location set — accuracy ${Math.round((me as any).accuracy ?? 0) || "good"}`
                  : "Dropoff location set."}{" "}
                <a href="#" onClick={(e) => { e.preventDefault(); requestLocation(); }}>
                  re-locate
                </a>
              </div>
            ) : (
              <button type="button" className="secondary" onClick={requestLocation} disabled={locating}>
                {locating ? "Locating…" : direction === "to-nomans" ? "Use my current location" : "Pick dropoff (use current location)"}
              </button>
            )}
            {locError && <div className="error">{locError}</div>}
          </div>

          <button style={{ marginTop: 16 }} disabled={submitting || !me} onClick={submit}>
            {submitting ? "Pinging…" : "Ping the combi"}
          </button>
          {submitError && <div className="error">{submitError}</div>}
        </div>
      )}

      {stopId && (
        <div className="card">
          <button className="secondary" onClick={cancel}>
            Cancel this ride
          </button>
          <div className="note" style={{ marginTop: 8 }}>
            Heads up: cancelling just removes it locally. Wave the driver off if you're already on the curb.
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 8 }}>
        <Map
          shuttle={shuttle}
          nomans={nomans}
          me={me}
          stops={state?.stops ?? []}
        />
      </div>

      <p className="note" style={{ textAlign: "center" }}>
        {lastUpdateSec == null
          ? "Waiting for shuttle signal…"
          : lastUpdateSec < 60
          ? `Shuttle updated ${lastUpdateSec}s ago`
          : `Shuttle signal stale (${Math.round(lastUpdateSec / 60)} min)`}
        {" · "}
        {state ? `${state.shuttle.onboard}/${state.shuttle.capacity} on board` : ""}
      </p>
    </main>
  );
}
