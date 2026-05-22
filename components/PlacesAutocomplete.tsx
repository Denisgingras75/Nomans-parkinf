"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/types";

type Suggestion = { placeId: string; mainText: string; secondaryText: string };

type Props = {
  onPick: (pick: { position: LatLng; label: string }) => void;
  placeholder?: string;
  initialValue?: string;
};

// Address search with Google Places Autocomplete. Falls back invisibly
// when GOOGLE_PLACES_API_KEY isn't configured server-side — the input
// just shows a quiet "(address search not configured)" hint and the
// caller's existing manual-coord flow remains the active path.
export default function PlacesAutocomplete({ onPick, placeholder, initialValue }: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced lookup: wait 250ms after the user stops typing.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim() || unavailable) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: value }),
        });
        if (res.status === 503) {
          setUnavailable(true);
          setSuggestions([]);
          return;
        }
        if (!res.ok) {
          setError("Address search isn't responding.");
          return;
        }
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
      } catch {
        setError("Network blip — try again.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, unavailable]);

  // Close dropdown on outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = async (s: Suggestion) => {
    setOpen(false);
    setValue(s.mainText);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(s.placeId)}`);
      if (!res.ok) {
        setError("Couldn't load that address.");
        return;
      }
      const data = (await res.json()) as { lat: number; lng: number; displayName: string; formattedAddress: string };
      onPick({
        position: { lat: data.lat, lng: data.lng },
        label: data.displayName || s.mainText,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "Search an address"}
        autoComplete="off"
      />
      {unavailable && (
        <div className="note" style={{ marginTop: 4 }}>
          (address search not configured — use the buttons below)
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            margin: "4px 0 0",
            padding: 0,
            listStyle: "none",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
          }}
        >
          {suggestions.map((s) => (
            <li
              key={s.placeId}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ color: "var(--text-bright)", fontWeight: 500 }}>{s.mainText}</div>
              {s.secondaryText && (
                <div className="note" style={{ marginTop: 2, fontSize: 12 }}>
                  {s.secondaryText}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <div className="note" style={{ marginTop: 4 }}>
          Searching…
        </div>
      )}
    </div>
  );
}
