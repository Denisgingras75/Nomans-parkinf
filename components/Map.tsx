"use client";

import { useEffect, useRef } from "react";
import type { LatLng } from "@/lib/types";

type MapStop = {
  id: string;
  kind: "pickup" | "dropoff";
  position: LatLng;
  status: string;
  name?: string;
};

type Props = {
  shuttle: LatLng | null;
  shuttleHeading?: number | null;
  shuttleSpeedMph?: number | null;
  nomans: LatLng;
  me?: LatLng | null;
  stops?: MapStop[];
  className?: string;
};

// Leaflet's divIcon HTML inherits :root vars from globals.css, so use
// var() refs directly instead of hardcoding hex.
const C = {
  rust: "var(--accent)",
  gilt: "var(--gilt)",
  chart: "var(--chart)",
  bone: "var(--text-bright)",
  paperDeep: "var(--bg-deep)",
};

const TRAIL_MAX = 24; // ~2 min of breadcrumbs if Bouncie pings every 5s

export default function Map({
  shuttle,
  shuttleHeading,
  shuttleSpeedMph,
  nomans,
  me,
  stops = [],
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const iconsRef = useRef<Record<string, any>>({});
  const trailRef = useRef<LatLng[]>([]);

  // One-time map initialization. Leaflet touches `window` so dynamic-import in effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      leafletRef.current = L;

      const dot = (color: string, size = 18) =>
        L.divIcon({
          className: "nomans-marker",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid ${C.paperDeep};box-shadow:0 0 0 1px rgba(0,0,0,0.45)"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      iconsRef.current = {
        nomans: dot(C.gilt, 20),
        me: dot(C.chart),
        pickup: dot(C.gilt),
        dropoff: dot(C.rust),
      };

      const center = shuttle ?? me ?? nomans;
      const map = L.map(containerRef.current).setView([center.lat, center.lng], 14);

      // Tile layer selection: Google Maps if a browser-restricted JS API
      // key is configured (set NEXT_PUBLIC_GOOGLE_MAPS_KEY + enable Maps
      // JavaScript API on the key), otherwise CartoDB Dark Matter as
      // the free no-key fallback that matches the almanac palette.
      const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
      if (gmapsKey) {
        await ensureGoogleMapsScript(gmapsKey);
        if (cancelled) return;
        // GoogleMutant lazy-imported so its side-effect L.gridLayer
        // augmentation only happens when we actually use it.
        // @ts-ignore — plugin ships without TS types
        await import("leaflet.gridlayer.googlemutant");
        (L as any).gridLayer
          .googleMutant({ type: "roadmap", maxZoom: 21 })
          .addTo(map);
      } else {
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          {
            maxZoom: 19,
            subdomains: "abcd",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        ).addTo(map);
      }
      mapRef.current = map;
      redraw();
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track shuttle position history for the breadcrumb trail. Only append
  // if the new fix is meaningfully different from the last (skips jitter).
  useEffect(() => {
    if (!shuttle) return;
    const last = trailRef.current[trailRef.current.length - 1];
    if (!last || Math.abs(last.lat - shuttle.lat) > 0.00005 || Math.abs(last.lng - shuttle.lng) > 0.00005) {
      trailRef.current = [...trailRef.current, shuttle].slice(-TRAIL_MAX);
    }
  }, [shuttle?.lat, shuttle?.lng]);

  // Redraw on any prop change.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shuttle?.lat,
    shuttle?.lng,
    shuttleHeading,
    me?.lat,
    me?.lng,
    nomans.lat,
    nomans.lng,
    JSON.stringify(stops.map((s) => [s.id, s.position.lat, s.position.lng, s.status, s.name])),
  ]);

  function shuttleMarkerHtml(heading: number | null | undefined): string {
    const rot = typeof heading === "number" && Number.isFinite(heading) ? heading : null;
    // Arrow points up by default; CSS rotate aligns to compass heading.
    // When heading is unknown, render a plain dot.
    if (rot === null) {
      return `<div style="width:20px;height:20px;border-radius:50%;background:${C.rust};border:3px solid ${C.paperDeep};box-shadow:0 0 0 1px rgba(0,0,0,0.45)"></div>`;
    }
    return `
      <div style="position:relative;width:32px;height:32px;">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);transform-origin:50% 50%;">
          <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2 L23 24 L14 19 L5 24 Z" fill="${C.rust}" stroke="${C.paperDeep}" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `;
  }

  function redraw() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    for (const layer of layersRef.current) map.removeLayer(layer);
    layersRef.current = [];

    const add = (pos: LatLng, icon: any, label: string) => {
      const marker = L.marker([pos.lat, pos.lng], { icon })
        .addTo(map)
        .bindTooltip(label, { direction: "top", offset: [0, -8] });
      layersRef.current.push(marker);
    };

    // Breadcrumb polyline — fade older segments using opacity.
    const trail = trailRef.current;
    if (trail.length >= 2) {
      for (let i = 1; i < trail.length; i++) {
        const opacity = 0.18 + 0.62 * (i / trail.length);
        const seg = L.polyline(
          [
            [trail[i - 1].lat, trail[i - 1].lng],
            [trail[i].lat, trail[i].lng],
          ],
          { color: C.rust, weight: 4, opacity, lineCap: "round" },
        ).addTo(map);
        layersRef.current.push(seg);
      }
    }

    add(nomans, iconsRef.current.nomans, "NoMans Restaurant");
    if (shuttle) {
      const shuttleIcon = L.divIcon({
        className: "nomans-shuttle-marker",
        html: shuttleMarkerHtml(shuttleHeading),
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const speedLabel =
        typeof shuttleSpeedMph === "number" && Number.isFinite(shuttleSpeedMph)
          ? `Combi · ${Math.round(shuttleSpeedMph)} mph`
          : "Combi shuttle";
      const marker = L.marker([shuttle.lat, shuttle.lng], { icon: shuttleIcon })
        .addTo(map)
        .bindTooltip(speedLabel, { direction: "top", offset: [0, -12] });
      layersRef.current.push(marker);
    }
    if (me) add(me, iconsRef.current.me, "You");
    for (const s of stops) {
      add(
        s.position,
        s.kind === "pickup" ? iconsRef.current.pickup : iconsRef.current.dropoff,
        `${s.kind === "pickup" ? "Pickup" : "Dropoff"}${s.name ? ` — ${s.name}` : ""} (${s.status})`,
      );
    }
  }

  return <div ref={containerRef} className={className ?? "map"} />;
}

// Load Google Maps JS API once per page. Subsequent callers reuse the
// in-flight promise so we never inject the script twice.
let gmapsLoadPromise: Promise<void> | null = null;
function ensureGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (gmapsLoadPromise) return gmapsLoadPromise;
  gmapsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("gmaps-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gmaps script failed")));
      return;
    }
    const script = document.createElement("script");
    script.id = "gmaps-script";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=&loading=async`;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("gmaps script failed")));
    document.head.appendChild(script);
  });
  return gmapsLoadPromise;
}
