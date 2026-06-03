"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { BBox, LatLng } from "@/lib/types";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

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
  stops: { id: string; kind: "pickup" | "dropoff"; position: LatLng; status: string }[];
  nomans: LatLng;
  bounds: BBox;
  online: boolean;
  yours: {
    etaMinutes: number | null;
    position: number;
    status: string;
    driverName: string | null;
    driverPhone: string | null;
    reassigning: boolean;
  } | null;
};

type Direction = "to-nomans" | "from-nomans";

export default function PassengerPage() {
  const [direction, setDirection] = useState<Direction>("to-nomans");
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [me, setMe] = useState<LatLng | null>(null);
  const [meLabel, setMeLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [state, setState] = useState<StateResponse | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelNote, setCancelNote] = useState<string | null>(null);

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
        setMeLabel("Current location");
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
    if (phone.replace(/\D/g, "").length < 10) {
      setSubmitError("Add your phone number so the driver can reach you.");
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
        body: JSON.stringify({ name, partySize, note, phone, direction, position: me }),
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

  const clearLocal = () => {
    setStopId(null);
    setCancelNote(null);
    localStorage.removeItem("nomans.stopId");
  };

  const cancel = async () => {
    if (!stopId) return clearLocal();
    setCancelling(true);
    setCancelNote(null);
    try {
      const res = await fetch(`/api/ping?stopId=${encodeURIComponent(stopId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        clearLocal();
      } else if (res.status === 409) {
        // Driver's already rolling — keep the ETA card, tell them to wave off.
        const data = await res.json().catch(() => null);
        setCancelNote(data?.error ?? "Too late to cancel — wave the driver off.");
      } else {
        // 404 (stop already gone) or anything else: just clear locally.
        clearLocal();
      }
    } catch {
      setCancelNote("Network error — try again.");
    } finally {
      setCancelling(false);
    }
  };

  const yours = state?.yours;
  const shuttles = (state?.shuttles ?? []).filter(
    (s): s is ShuttleFeed & { position: LatLng } => s.position != null,
  );
  const nomans = state?.nomans ?? { lat: 41.4541, lng: -70.5605 };
  // Freshest fix across all live vans, for the "updated Ns ago" line.
  const newestUpdate = shuttles.reduce<number | null>(
    (max, s) => (s.updatedAt != null && (max == null || s.updatedAt > max) ? s.updatedAt : max),
    null,
  );
  const lastUpdateSec = newestUpdate
    ? Math.max(0, Math.round((Date.now() - newestUpdate) / 1000))
    : null;

  return (
    <main className="page">
      <header className="brand">
        <img src="/nomans-logo.png" alt="NoMans · Martha's Vineyard" className="brand-logo" />
        <div className="brand-tag">Oak Bluffs Combi Shuttle</div>
      </header>

      {state && !state.online && !stopId && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--danger)" }}>
            The combi is off duty
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            Please check back during service hours.
          </div>
        </div>
      )}

      {stopId && yours && yours.status === "cancelled" ? (
        <div className="eta-card" style={{ borderColor: "var(--danger)" }}>
          <div className="label">Ride cancelled</div>
          <div style={{ marginTop: 6, fontSize: 14 }}>
            No driver was able to take this one. Tap below to ping the combi again.
          </div>
          <button style={{ marginTop: 12 }} onClick={clearLocal}>
            Ping again
          </button>
        </div>
      ) : stopId && yours && yours.status === "dropped-off" ? (
        <div className="eta-card">
          <div className="label">You've arrived 🎉</div>
          <div style={{ marginTop: 6, fontSize: 14 }}>Thanks for riding the combi.</div>
          <button style={{ marginTop: 12 }} onClick={clearLocal}>
            Done
          </button>
        </div>
      ) : stopId && yours ? (
        <div className="eta-card">
          <div className="label">
            {yours.status === "picked-up"
              ? "On board"
              : yours.driverName
              ? `${yours.driverName} is on the way`
              : yours.reassigning
              ? "Finding you another driver…"
              : "Combi inbound"}
          </div>
          <div className="big">
            {yours.reassigning || yours.etaMinutes == null ? "—" : `${yours.etaMinutes} min`}
          </div>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {yours.status === "picked-up"
              ? "Sit tight — heading to your dropoff."
              : yours.driverName
              ? "Your driver has your pickup — hang tight."
              : yours.reassigning
              ? "Hang tight — we're matching you with the next available combi."
              : `You're #${yours.position} in the queue.`}
          </div>
          {yours.driverName && (
            <div className="driver-chip">
              <span>🚐 {yours.driverName}</span>
              {yours.driverPhone && (
                <a className="contact-link call-link" href={`tel:${yours.driverPhone}`}>
                  📞 Call driver
                </a>
              )}
            </div>
          )}
        </div>
      ) : null}

      {!stopId && state?.online !== false && (
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
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="508-555-1234"
              />
            </div>
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

          <div style={{ marginTop: 16 }}>
            <label>{direction === "to-nomans" ? "Pickup address" : "Dropoff address"}</label>
            <PlacesAutocomplete
              placeholder={
                direction === "to-nomans"
                  ? "Landmark or address — e.g. Tony's Market"
                  : "Landmark or address — e.g. the Wesley Hotel"
              }
              initialValue={meLabel && meLabel !== "Current location" ? meLabel : ""}
              onPick={(p) => {
                setMe(p.position);
                setMeLabel(p.label);
                setLocError(null);
              }}
            />
            {me ? (
              <div className="note" style={{ marginTop: 8 }}>
                {direction === "to-nomans" ? "Pickup" : "Dropoff"} at{" "}
                <strong>{meLabel ?? "set location"}</strong>.{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMe(null);
                    setMeLabel(null);
                  }}
                >
                  change
                </a>
              </div>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={requestLocation}
                disabled={locating}
                style={{ marginTop: 8 }}
              >
                {locating ? "Locating…" : "Or use my current location"}
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

      {stopId && !(yours && (yours.status === "cancelled" || yours.status === "dropped-off")) && (
        <div className="card">
          <button className="secondary" disabled={cancelling} onClick={cancel}>
            {cancelling ? "Cancelling…" : "Cancel this ride"}
          </button>
          {cancelNote ? (
            <div className="note" style={{ marginTop: 8, color: "var(--danger)" }}>
              {cancelNote}
            </div>
          ) : (
            <div className="note" style={{ marginTop: 8 }}>
              Cancelling pulls you out of the driver's queue. If you're already on the curb, wave the driver off too.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 8 }}>
        <Map
          shuttles={shuttles}
          nomans={nomans}
          bounds={state?.bounds}
          me={me}
          stops={state?.stops ?? []}
          // Let the rider correct a fuzzy GPS pin by dragging — but only
          // before the ride is placed; once pinged, the stop is fixed.
          onMeDrag={
            me && !stopId
              ? (p) => {
                  setMe(p);
                  setMeLabel("Adjusted pin");
                }
              : undefined
          }
        />
        {me && !stopId && (
          <p className="note" style={{ textAlign: "center", margin: "6px 0 0" }}>
            📍 Pin not quite right? Drag the blue dot to your exact spot.
          </p>
        )}
      </div>

      <p className="note" style={{ textAlign: "center" }}>
        {lastUpdateSec == null
          ? "Waiting for shuttle signal…"
          : lastUpdateSec < 60
          ? `Shuttle updated ${lastUpdateSec}s ago`
          : `Shuttle signal stale (${Math.round(lastUpdateSec / 60)} min)`}
        {" · "}
        {state ? `${state.onboard}/${state.capacity} on board` : ""}
      </p>

      <footer
        className="note"
        style={{
          textAlign: "center",
          marginTop: 8,
          paddingBottom: 12,
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        <a href="/driver">Driver login</a>
        {" · "}
        <a href="/admin">Owner / Manager</a>
      </footer>
    </main>
  );
}
