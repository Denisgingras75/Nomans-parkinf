"use client";

import { useEffect, useRef, useState } from "react";
import type { BBox, Driver, LatLng, Manager, ServiceHours, Settings, Stop } from "@/lib/types";
import { createChimeContext, playChime } from "@/lib/chime";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";

type OnlineReason = "open" | "manual" | "schedule";

type AdminState = {
  settings: Settings;
  drivers: Driver[];
  today: Stop[];
  legacyDriverEnabled: boolean;
  smsConfigured: boolean;
  shuttles: { id: string; label?: string; position: LatLng | null; heading: number | null; speedMph: number | null; updatedAt: number | null }[];
  onboard: number;
  capacity: number;
  onlineReason: OnlineReason;
  isBootstrap: boolean;
  managers?: Manager[];
};

export default function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [addingDriver, setAddingDriver] = useState(false);
  const [editingPhoneFor, setEditingPhoneFor] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [smsTestStatus, setSmsTestStatus] = useState<string | null>(null);
  const [smsTesting, setSmsTesting] = useState(false);
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerPhone, setNewManagerPhone] = useState("");
  const [addingManager, setAddingManager] = useState(false);

  const testChime = () => {
    if (!audioCtxRef.current) audioCtxRef.current = createChimeContext();
    playChime(audioCtxRef.current);
  };

  const testSms = async () => {
    setSmsTesting(true);
    setSmsTestStatus(null);
    try {
      const res = await fetch("/api/admin/sms-test", {
        method: "POST",
        headers: { "x-admin-passcode": passcode },
      });
      const json = await res.json();
      if (!res.ok) {
        setSmsTestStatus(json.error ?? "Test failed");
        return;
      }
      if (json.failed === 0) {
        setSmsTestStatus(`✓ Sent to ${json.sent} driver${json.sent === 1 ? "" : "s"}.`);
      } else {
        setSmsTestStatus(`Sent ${json.sent}/${json.total}. Failures logged.`);
      }
    } catch {
      setSmsTestStatus("Network error.");
    } finally {
      setSmsTesting(false);
    }
  };

  useEffect(() => {
    // Deep-link from a manager QR: ?code=MGR-XXXXXX (or scanned MGR-)
    // — auto-fill, store, and unlock, then strip the param.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code && code.startsWith("MGR-")) {
      setPasscode(code);
      localStorage.setItem("nomans.adminPass", code);
      setAuthed(true);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
      return;
    }
    const saved = localStorage.getItem("nomans.adminPass");
    if (saved) {
      setPasscode(saved);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    let alive = true;
    const fetchAll = async () => {
      try {
        const res = await fetch("/api/admin/state", {
          headers: { "x-admin-passcode": passcode },
          cache: "no-store",
        });
        if (res.status === 401) {
          if (alive) {
            setAuthed(false);
            localStorage.removeItem("nomans.adminPass");
            setError("Wrong passcode.");
          }
          return;
        }
        if (!res.ok) return;
        const d = (await res.json()) as AdminState;
        if (alive) setData(d);
      } catch {
        /* transient */
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [authed, passcode]);

  const unlock = () => {
    localStorage.setItem("nomans.adminPass", passcode);
    setAuthed(true);
    setError(null);
  };

  const lock = () => {
    localStorage.removeItem("nomans.adminPass");
    setAuthed(false);
    setPasscode("");
    setData(null);
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save");
      } else if (data) {
        setData({ ...data, settings: json.settings });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const addDriver = async () => {
    const name = newDriverName.trim();
    if (!name) return;
    setAddingDriver(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ name, phone: newDriverPhone.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not add driver");
      } else if (data) {
        setData({ ...data, drivers: [...data.drivers, json.driver] });
        setNewDriverName("");
        setNewDriverPhone("");
      }
    } finally {
      setAddingDriver(false);
    }
  };

  const addManager = async () => {
    const name = newManagerName.trim();
    if (!name) return;
    setAddingManager(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ name, phone: newManagerPhone.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not add manager");
      } else if (data) {
        setData({ ...data, managers: [...(data.managers ?? []), json.manager] });
        setNewManagerName("");
        setNewManagerPhone("");
      }
    } finally {
      setAddingManager(false);
    }
  };

  const revokeManager = async (id: string, name: string) => {
    if (!confirm(`Revoke ${name}'s manager code? They won't be able to log in anymore.`)) return;
    const res = await fetch(`/api/admin/managers?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-passcode": passcode },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Revoke failed");
      return;
    }
    if (data) {
      setData({ ...data, managers: (data.managers ?? []).filter((m) => m.id !== id) });
    }
  };

  const patchDriver = async (id: string, patch: Partial<Driver>) => {
    setError(null);
    const res = await fetch("/api/admin/drivers", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-passcode": passcode },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Update failed");
      return;
    }
    if (data) {
      setData({
        ...data,
        drivers: data.drivers.map((d) => (d.id === id ? json.driver : d)),
      });
    }
  };

  const startEditPhone = (driver: Driver) => {
    setEditingPhoneFor(driver.id);
    setPhoneDraft(driver.phone ?? "");
  };

  const saveEditPhone = async (id: string) => {
    await patchDriver(id, { phone: phoneDraft.trim() || null });
    setEditingPhoneFor(null);
    setPhoneDraft("");
  };

  const revokeDriver = async (id: string) => {
    if (!confirm("Revoke this driver's code? They won't be able to log in anymore.")) return;
    const res = await fetch(`/api/admin/drivers?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-passcode": passcode },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Revoke failed");
      return;
    }
    if (data) setData({ ...data, drivers: data.drivers.filter((d) => d.id !== id) });
  };

  if (!authed) {
    return (
      <main className="page">
        <header className="brand">
          <img src="/nomans-logo.png" alt="NoMans" className="brand-logo" />
          <div className="brand-tag">Admin</div>
        </header>
        <div className="card">
          <label htmlFor="pass">Admin passcode</label>
          <input
            id="pass"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Set ADMIN_PASSCODE in Vercel env"
          />
          <button style={{ marginTop: 12 }} onClick={unlock}>
            Unlock
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="card note">Loading…</div>
      </main>
    );
  }

  const { settings, drivers, today, legacyDriverEnabled, smsConfigured, shuttles, onboard, capacity, onlineReason } = data;
  // Freshest fix across all vans, for the "updated Ns ago" readout.
  const newestUpdate = shuttles.reduce<number | null>(
    (max, s) => (s.updatedAt != null && (max == null || s.updatedAt > max) ? s.updatedAt : max),
    null,
  );
  const updatedAgo = newestUpdate != null ? Math.round((Date.now() - newestUpdate) / 1000) : null;
  const effectivelyOnline = onlineReason === "open";

  return (
    <main className="page">
      <header className="brand">
        <img src="/nomans-logo.png" alt="NoMans" className="brand-logo" />
        <div className="brand-tag">Admin</div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="error">{error}</div>
        </div>
      )}

      {/* Service status */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              Service is{" "}
              <span style={{ color: effectivelyOnline ? "var(--ok)" : "var(--danger)" }}>
                {effectivelyOnline ? "ONLINE" : "OFFLINE"}
              </span>
              {onlineReason === "schedule" && (
                <span className="note" style={{ marginLeft: 8 }}>(outside service hours)</span>
              )}
              {onlineReason === "manual" && !settings.online && (
                <span className="note" style={{ marginLeft: 8 }}>(manually taken offline)</span>
              )}
            </div>
            <div className="note">
              {effectivelyOnline
                ? "Guests can ping the combi."
                : "Pings are blocked. Guests see an off-duty message."}
            </div>
          </div>
          <button
            className={settings.online ? "danger" : "ok"}
            style={{ width: "auto" }}
            disabled={savingSettings}
            onClick={() => saveSettings({ online: !settings.online })}
          >
            {settings.online ? "Take offline" : "Go online"}
          </button>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
        <div className="kpi">
          <div>
            <div className="num">{onboard}/{capacity}</div>
            <div className="lbl">On board now</div>
          </div>
          <div>
            <div className="num">{today.length}</div>
            <div className="lbl">Stops today</div>
          </div>
          <div>
            <div className="num">
              {updatedAgo == null ? "—" : updatedAgo < 60 ? `${updatedAgo}s` : `${Math.round(updatedAgo / 60)}m`}
            </div>
            <div className="lbl">Last GPS</div>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>SMS alerts to on-shift drivers</div>
            <div className="note">
              {!smsConfigured
                ? "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM in Vercel env vars to enable."
                : settings.alertsEnabled
                ? "Drivers marked on-shift with a phone number get texted on each new pickup."
                : "Pings won't text drivers until you re-enable this."}
            </div>
          </div>
          <button
            className={settings.alertsEnabled ? "danger" : "ok"}
            style={{ width: "auto" }}
            disabled={savingSettings || !smsConfigured}
            onClick={() => saveSettings({ alertsEnabled: !settings.alertsEnabled })}
          >
            {settings.alertsEnabled ? "Pause alerts" : "Enable alerts"}
          </button>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>SMS path test</div>
            <div className="note">
              Sends "🚐 TEST PING" to every on-shift driver with a phone on file. Use it before opening for the night.
            </div>
            {smsTestStatus && (
              <div className="note" style={{ marginTop: 6, color: "var(--text-bright)" }}>
                {smsTestStatus}
              </div>
            )}
          </div>
          <button
            className="secondary"
            style={{ width: "auto" }}
            disabled={smsTesting || !smsConfigured}
            onClick={testSms}
          >
            {smsTesting ? "Sending…" : "Send test SMS"}
          </button>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Driver chime test</div>
            <div className="note">
              Plays the same bing-bong the /driver dashboard makes on a new pickup. iOS Safari won't make a sound until you tap — try it on the device the driver will use.
            </div>
          </div>
          <button
            className="secondary"
            style={{ width: "auto" }}
            onClick={testChime}
          >
            Play chime
          </button>
        </div>
      </div>

      {/* Managers — only the bootstrap (env-var passcode) can see or
          manage other managers. Hidden when a manager is logged in. */}
      {data.isBootstrap && (
        <div className="card">
          <h2 style={{ margin: "0 0 8px" }}>Managers</h2>
          <div className="note" style={{ marginBottom: 12 }}>
            Staff who can log into <code>/admin</code> with their own code. Each has the same powers as you, except they can't see or manage this list. Add anyone you trust to add drivers, edit phones, send test SMS, etc.
          </div>
          {(data.managers ?? []).length === 0 && (
            <div className="note" style={{ marginBottom: 12 }}>
              No managers yet. Add one below — text them the <code>MGR-XXXXXX</code> code so they can unlock <code>/admin</code> on their phone.
            </div>
          )}
          {(data.managers ?? []).map((m) => (
            <div key={m.id} className="stop" style={{ marginBottom: 10 }}>
              <div className="stop-head">
                <div>
                  <strong>{m.name}</strong>{" "}
                  <span
                    style={{
                      color: "var(--accent)",
                      fontFamily: "ui-monospace, Menlo, monospace",
                    }}
                  >
                    {m.passcode}
                  </span>
                  {m.phone && (
                    <span className="note" style={{ marginLeft: 8 }}>📱 {m.phone}</span>
                  )}
                </div>
                <button
                  className="danger"
                  style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                  onClick={() => revokeManager(m.id, m.name)}
                >
                  Revoke
                </button>
              </div>
              <CodeQR
                kind="manager"
                code={m.passcode}
                hint="Show the manager this QR — their camera scans it and they're logged in."
              />
              <div className="note" style={{ marginTop: 4 }}>
                Added {new Date(m.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="Manager name"
              value={newManagerName}
              onChange={(e) => setNewManagerName(e.target.value)}
            />
            <input
              placeholder="Phone (optional)"
              value={newManagerPhone}
              onChange={(e) => setNewManagerPhone(e.target.value)}
            />
          </div>
          <button
            style={{ marginTop: 8 }}
            onClick={addManager}
            disabled={addingManager || !newManagerName.trim()}
          >
            Add manager
          </button>
        </div>
      )}

      {/* Drivers */}
      <div className="card">
        <h2 style={{ margin: "0 0 8px" }}>Drivers</h2>
        {drivers.length === 0 && (
          <div className="note" style={{ marginBottom: 12 }}>
            {legacyDriverEnabled
              ? "No drivers added yet. Drivers can log in with the legacy DRIVER_PASSCODE env var until you add one here."
              : "No drivers yet. Add one below — they'll use the code shown to log in at /driver."}
          </div>
        )}
        {drivers.map((d) => (
          <div key={d.id} className="stop" style={{ marginBottom: 10 }}>
            <div className="stop-head">
              <div>
                <strong>{d.name}</strong>{" "}
                <span style={{ color: "var(--accent)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                  {d.passcode}
                </span>
              </div>
              <button
                className="danger"
                style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                onClick={() => revokeDriver(d.id)}
              >
                Revoke
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <button
                className={d.onShift ? "ok" : "secondary"}
                style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                onClick={() => patchDriver(d.id, { onShift: !d.onShift })}
              >
                {d.onShift ? "● On shift" : "○ Off shift"}
              </button>

              {editingPhoneFor === d.id ? (
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="508-555-1234"
                    style={{ maxWidth: 160 }}
                  />
                  <button
                    style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                    onClick={() => saveEditPhone(d.id)}
                  >
                    Save
                  </button>
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                    onClick={() => setEditingPhoneFor(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                  onClick={() => startEditPhone(d)}
                  title={d.phone ?? "No phone — won't receive SMS alerts"}
                >
                  {d.phone ? `📱 ${d.phone}` : "+ Add phone"}
                </button>
              )}

              {d.onShift && smsConfigured && settings.alertsEnabled && d.phone && (
                <span className="note" style={{ color: "var(--ok)" }}>🔔 alerts on</span>
              )}
            </div>

            <CodeQR
              kind="driver"
              code={d.passcode}
              hint="Show the driver this QR — their camera scans it and they're logged in."
            />

            <div className="note" style={{ marginTop: 4 }}>
              Added {new Date(d.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Driver name"
            value={newDriverName}
            onChange={(e) => setNewDriverName(e.target.value)}
          />
          <input
            placeholder="Phone (optional)"
            value={newDriverPhone}
            onChange={(e) => setNewDriverPhone(e.target.value)}
          />
        </div>
        <button
          style={{ marginTop: 8 }}
          onClick={addDriver}
          disabled={addingDriver || !newDriverName.trim()}
        >
          Add driver
        </button>
      </div>

      {/* Service hours */}
      <ServiceHoursEditor
        current={settings.hours}
        saving={savingSettings}
        onSave={(hours) => saveSettings({ hours })}
      />

      {/* NoMans location */}
      <NoMansEditor
        current={settings.nomans}
        saving={savingSettings}
        onSave={(nomans) => saveSettings({ nomans })}
      />

      {/* Service area */}
      <BoundsEditor
        current={settings.bounds}
        saving={savingSettings}
        onSave={(bounds) => saveSettings({ bounds })}
      />

      {/* Capacity */}
      <CapacityEditor
        current={settings.capacity}
        saving={savingSettings}
        onSave={(capacity) => saveSettings({ capacity })}
      />

      {/* Vehicle labels */}
      <VehiclesEditor
        shuttles={shuttles}
        labels={settings.vehicleLabels ?? {}}
        saving={savingSettings}
        onSave={(vehicleLabels) => saveSettings({ vehicleLabels })}
      />

      {/* Today */}
      <div className="card">
        <h2 style={{ margin: "0 0 8px" }}>Today's rides</h2>
        {today.length === 0 && <div className="note">Nothing yet today.</div>}
        {today.map((s) => (
          <div key={s.id} className="stop" style={{ marginBottom: 6 }}>
            <div className="stop-head">
              <div>
                <span className={`tag ${s.kind}`}>{s.kind}</span>{" "}
                <strong>{s.name ?? "Guest"}</strong>{" "}
                <span className="note">× {s.partySize}</span>
              </div>
              <span className={`tag ${s.status === "dropped-off" ? "enroute" : "queued"}`}>
                {s.status}
              </span>
            </div>
            <div className="note">
              {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {s.note ? ` · ${s.note}` : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <button className="secondary" style={{ width: "auto" }} onClick={lock}>
          Lock admin
        </button>
      </div>
    </main>
  );
}

function NoMansEditor({
  current,
  saving,
  onSave,
}: {
  current: LatLng;
  saving: boolean;
  onSave: (n: LatLng) => void;
}) {
  const [lat, setLat] = useState(current.lat.toFixed(6));
  const [lng, setLng] = useState(current.lng.toFixed(6));
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLat(current.lat.toFixed(6));
    setLng(current.lng.toFixed(6));
  }, [current.lat, current.lng]);

  const useHere = () => {
    if (!navigator.geolocation) {
      setErr("This browser can't share location.");
      return;
    }
    setLocating(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (e) => {
        setErr(e.message || "Couldn't get location");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = () => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      setErr("Lat/lng must be numbers");
      return;
    }
    onSave({ lat: la, lng: ln });
  };

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px" }}>NoMans pin</h2>
      <div className="note" style={{ marginBottom: 12 }}>
        Search an address, stand at the front door and tap "Use my current location," or paste a lat/lng from Google Maps.
      </div>
      <label>Search</label>
      <PlacesAutocomplete
        placeholder="e.g. Nomans Oak Bluffs"
        onPick={(p) => {
          setLat(p.position.lat.toFixed(6));
          setLng(p.position.lng.toFixed(6));
          setErr(null);
        }}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Lat</label>
          <input value={lat} onChange={(e) => setLat(e.target.value)} />
        </div>
        <div>
          <label>Lng</label>
          <input value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="secondary" onClick={useHere} disabled={locating} style={{ width: "auto" }}>
          {locating ? "Locating…" : "Use my current location"}
        </button>
        <button onClick={save} disabled={saving} style={{ width: "auto" }}>
          Save pin
        </button>
      </div>
      {err && <div className="error">{err}</div>}
    </div>
  );
}

function BoundsEditor({
  current,
  saving,
  onSave,
}: {
  current: BBox;
  saving: boolean;
  onSave: (b: BBox) => void;
}) {
  const [south, setSouth] = useState(current.south.toString());
  const [north, setNorth] = useState(current.north.toString());
  const [west, setWest] = useState(current.west.toString());
  const [east, setEast] = useState(current.east.toString());

  useEffect(() => {
    setSouth(current.south.toString());
    setNorth(current.north.toString());
    setWest(current.west.toString());
    setEast(current.east.toString());
  }, [current.south, current.north, current.west, current.east]);

  const save = () => {
    onSave({
      south: Number(south),
      north: Number(north),
      west: Number(west),
      east: Number(east),
    });
  };

  const resetDefault = () => {
    setSouth("41.438");
    setNorth("41.472");
    setWest("-70.578");
    setEast("-70.546");
  };

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px" }}>Service area</h2>
      <div className="note" style={{ marginBottom: 12 }}>
        Bounding box for valid pickup &amp; dropoff locations. Pings outside the box are rejected.
      </div>
      <div className="row">
        <div>
          <label>North (lat)</label>
          <input value={north} onChange={(e) => setNorth(e.target.value)} />
        </div>
        <div>
          <label>South (lat)</label>
          <input value={south} onChange={(e) => setSouth(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label>West (lng)</label>
          <input value={west} onChange={(e) => setWest(e.target.value)} />
        </div>
        <div>
          <label>East (lng)</label>
          <input value={east} onChange={(e) => setEast(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="secondary" style={{ width: "auto" }} onClick={resetDefault}>
          Reset to default
        </button>
        <button onClick={save} disabled={saving} style={{ width: "auto" }}>
          Save area
        </button>
      </div>
    </div>
  );
}

function CapacityEditor({
  current,
  saving,
  onSave,
}: {
  current: number;
  saving: boolean;
  onSave: (c: number) => void;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px" }}>Capacity</h2>
      <div className="note" style={{ marginBottom: 12 }}>
        Maximum guests on board at once. New pings are blocked when the combi is full.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={1}
          max={32}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ maxWidth: 100 }}
        />
        <button onClick={() => onSave(value)} disabled={saving} style={{ width: "auto" }}>
          Save capacity
        </button>
      </div>
    </div>
  );
}

// Name each tracked vehicle so the map dots read "Van 1 / Van 2" instead of a
// generic "Combi". Vehicles appear here once their Bouncie (or a driver's
// phone) reports GPS; the owner labels each tracker id.
function VehiclesEditor({
  shuttles,
  labels,
  saving,
  onSave,
}: {
  shuttles: { id: string; speedMph: number | null; updatedAt: number | null }[];
  labels: Record<string, string>;
  saving: boolean;
  onSave: (labels: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(labels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(labels), [JSON.stringify(labels)]);

  // Union of vehicles seen live + any already-named id, so a parked van you've
  // labelled still shows up for editing even when it isn't reporting.
  const ids = Array.from(new Set([...shuttles.map((s) => s.id), ...Object.keys(labels)]));

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px" }}>Vehicles</h2>
      <div className="note" style={{ marginBottom: 12 }}>
        Name each van so the map shows “Van 1 / Van 2” instead of “Combi”. Drive a van and its
        tracker id appears below — just label the one that’s moving.
      </div>
      {ids.length === 0 && (
        <div className="note">
          No vehicles have reported yet. They’ll appear once a van’s Bouncie pushes GPS (or a
          driver broadcasts phone GPS).
        </div>
      )}
      {ids.map((id) => {
        const live = shuttles.find((s) => s.id === id);
        const ago = live?.updatedAt != null ? Math.round((Date.now() - live.updatedAt) / 1000) : null;
        const seen =
          ago == null
            ? "not reporting"
            : ago < 60
            ? `${ago}s ago`
            : `${Math.round(ago / 60)}m ago`;
        const speed = typeof live?.speedMph === "number" ? ` · ${Math.round(live.speedMph)} mph` : "";
        return (
          <div key={id} style={{ marginBottom: 10 }}>
            <input
              value={draft[id] ?? ""}
              placeholder="e.g. Van 1"
              onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
            />
            <div className="note" style={{ fontSize: 11, wordBreak: "break-all", marginTop: 2 }}>
              <code>{id}</code> · {seen}
              {speed}
            </div>
          </div>
        );
      })}
      {ids.length > 0 && (
        <button onClick={() => onSave(draft)} disabled={saving} style={{ width: "auto", marginTop: 4 }}>
          Save names
        </button>
      )}
    </div>
  );
}

// Tiny inline QR for a driver/manager onboarding code. The QR encodes
// a deep link to /driver?code=... or /admin?code=... so scanning with
// the phone camera unlocks the page directly. Uses goQR.me's free API
// to avoid pulling in a client-side QR library — adds zero JS weight.
function CodeQR({
  kind,
  code,
  hint,
}: {
  kind: "driver" | "manager";
  code: string;
  hint: string;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  if (!origin) return null;
  const path = kind === "driver" ? "/driver" : "/admin";
  const deepLink = `${origin}${path}?code=${encodeURIComponent(code)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(deepLink)}&size=140x140&margin=2`;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginTop: 10,
        padding: 10,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <img
        src={qrSrc}
        alt={`Login QR for ${code}`}
        width={120}
        height={120}
        // White background is intentional and must stay literal — a
        // themed `var(--bg)` would be dark navy and break the contrast
        // QR scanners rely on for reliable phone-camera reads.
        style={{ background: "#ffffff", borderRadius: 6, padding: 4, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="note" style={{ marginBottom: 4 }}>{hint}</div>
        <div
          className="note"
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11,
            wordBreak: "break-all",
            color: "var(--muted-soft)",
          }}
        >
          {deepLink}
        </div>
      </div>
    </div>
  );
}

function ServiceHoursEditor({
  current,
  saving,
  onSave,
}: {
  current: ServiceHours;
  saving: boolean;
  onSave: (h: ServiceHours) => void;
}) {
  const [enabled, setEnabled] = useState(current.enabled);
  const [open, setOpen] = useState(current.open);
  const [close, setClose] = useState(current.close);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(current.enabled);
    setOpen(current.open);
    setClose(current.close);
  }, [current.enabled, current.open, current.close]);

  const save = () => {
    setErr(null);
    if (!/^\d{1,2}:\d{2}$/.test(open) || !/^\d{1,2}:\d{2}$/.test(close)) {
      setErr("Times must look like 17:00 (24-hour clock).");
      return;
    }
    onSave({ enabled, open, close });
  };

  const wrapsMidnight = open && close && open > close;

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px" }}>Service hours</h2>
      <div className="note" style={{ marginBottom: 12 }}>
        When enabled, the combi auto-goes online and offline in this window (Eastern time).
        The manual offline toggle above still wins as a kill-switch.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span>Schedule enabled</span>
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Open (HH:MM)</label>
          <input value={open} onChange={(e) => setOpen(e.target.value)} placeholder="17:00" />
        </div>
        <div>
          <label>Close (HH:MM)</label>
          <input value={close} onChange={(e) => setClose(e.target.value)} placeholder="23:00" />
        </div>
      </div>
      {wrapsMidnight && (
        <div className="note" style={{ marginTop: 8 }}>
          This window wraps past midnight ({open} → {close} next day).
        </div>
      )}
      <button onClick={save} disabled={saving} style={{ marginTop: 12, width: "auto" }}>
        Save hours
      </button>
      {err && <div className="error">{err}</div>}
    </div>
  );
}
