"use client";

import { useEffect, useRef } from "react";
import type { BBox, LatLng } from "@/lib/types";

type MapStop = {
  id: string;
  kind: "pickup" | "dropoff";
  position: LatLng;
  status: string;
  name?: string;
};

type MapShuttle = {
  id: string;
  position: LatLng;
  heading?: number | null;
  speedMph?: number | null;
  label?: string | null;
  updatedAt?: number | null;
};

// A fix older than this is "stale": the van is parked or out of signal. We
// still show its last-known spot, but dimmed and without a (frozen) speed,
// so a sitting van never looks like it's doing 22 mph.
const STALE_MS = 10 * 60 * 1000;

type Props = {
  shuttles?: MapShuttle[];
  nomans: LatLng;
  me?: LatLng | null;
  stops?: MapStop[];
  className?: string;
  // Service-area box. When provided the map is fitted to Oak Bluffs and panning
  // is walled in to it (can't scroll off to the rest of the island), and you
  // can't zoom out past the box.
  bounds?: BBox | null;
  // When provided, the "You" marker becomes draggable and this fires with the
  // new coordinate on drag-end — lets a passenger nudge a fuzzy GPS pin to
  // their real pickup spot before pinging.
  onMeDrag?: (pos: LatLng) => void;
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
  shuttles = [],
  nomans,
  me,
  stops = [],
  className,
  onMeDrag,
  bounds,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const iconsRef = useRef<Record<string, any>>({});
  // Breadcrumb trails keyed by shuttle id so two vans keep separate trails.
  const trailsRef = useRef<Record<string, LatLng[]>>({});
  // Latest service-area box, read by applyBoundsLock without re-running init.
  const boundsRef = useRef<BBox | null | undefined>(bounds);
  boundsRef.current = bounds;
  const boundsFitRef = useRef(false);

  // Wall the map into Oak Bluffs: fit to the box once, lock panning to it, and
  // forbid zooming out past it. Safe to call repeatedly — only the first call
  // re-frames the view so a settings poll doesn't yank it around.
  function applyBoundsLock() {
    const map = mapRef.current;
    const L = leafletRef.current;
    const b = boundsRef.current;
    if (!map || !L || !b) return;
    const llb = L.latLngBounds([b.south, b.west], [b.north, b.east]);
    map.options.maxBoundsViscosity = 1.0; // hard wall, no rubber-banding
    map.setMaxBounds(llb.pad(0.12));
    if (!boundsFitRef.current) {
      map.fitBounds(llb);
      map.setMinZoom(map.getZoom()); // can't zoom out past the service area
      boundsFitRef.current = true;
    }
  }

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
      // NoMans is a teardrop PIN (not a round dot) so the destination can't be
      // mistaken for a van marker.
      const pin = L.divIcon({
        className: "nomans-marker",
        html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 0 C5.8 0 0 5.8 0 13 C0 22 13 34 13 34 C13 34 26 22 26 13 C26 5.8 20.2 0 13 0 Z" fill="${C.gilt}" stroke="${C.paperDeep}" stroke-width="2"/>
            <circle cx="13" cy="13" r="4.5" fill="${C.paperDeep}"/>
          </svg>`,
        iconSize: [26, 34],
        iconAnchor: [13, 34],
      });
      iconsRef.current = {
        nomans: pin,
        me: dot(C.chart),
        pickup: dot(C.gilt),
        dropoff: dot(C.rust),
      };

      const center = shuttles[0]?.position ?? me ?? nomans;
      const map = L.map(containerRef.current).setView([center.lat, center.lng], 14);

      // ALWAYS lay down CartoDB Dark Matter first as a guaranteed base — it
      // needs no key and matches the palette. Google Maps then overlays on
      // top when a key is configured. If Google fails for ANY reason (script
      // blocked, Maps JS API not enabled on the key, billing/quota), Carto
      // shows through instead of leaving a blank/gray map.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          subdomains: "abcd",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      ).addTo(map);

      const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
      if (gmapsKey) {
        let gmLayer: any = null;
        // Google calls this global when the key is rejected (API not enabled,
        // referrer blocked, quota exceeded). Drop the Google layer so the
        // CartoDB base underneath stays visible.
        (window as any).gm_authFailure = () => {
          if (gmLayer) {
            try {
              map.removeLayer(gmLayer);
            } catch {
              /* already gone */
            }
          }
        };
        try {
          await ensureGoogleMapsScript(gmapsKey);
          if (cancelled) return;
          // GoogleMutant lazy-imported so its side-effect L.gridLayer
          // augmentation only happens when we actually use it.
          // @ts-ignore — plugin ships without TS types
          await import("leaflet.gridlayer.googlemutant");
          gmLayer = (L as any).gridLayer.googleMutant({ type: "roadmap", maxZoom: 21 });
          gmLayer.addTo(map);
        } catch {
          // Script failed to load outright — CartoDB base is already showing.
        }
      }
      mapRef.current = map;
      applyBoundsLock();
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

  // Track each van's position history for its breadcrumb trail. Only append
  // if the new fix is meaningfully different from the last (skips jitter).
  // Keyed by shuttle id so two vans don't share a trail.
  const shuttleSig = JSON.stringify(
    shuttles.map((s) => [s.id, s.position.lat, s.position.lng, s.heading]),
  );
  useEffect(() => {
    const seen = new Set<string>();
    for (const s of shuttles) {
      seen.add(s.id);
      const trail = trailsRef.current[s.id] ?? [];
      const last = trail[trail.length - 1];
      if (
        !last ||
        Math.abs(last.lat - s.position.lat) > 0.00005 ||
        Math.abs(last.lng - s.position.lng) > 0.00005
      ) {
        trailsRef.current[s.id] = [...trail, s.position].slice(-TRAIL_MAX);
      }
    }
    // Drop trails for vans no longer in the feed (went stale/off).
    for (const id of Object.keys(trailsRef.current)) {
      if (!seen.has(id)) delete trailsRef.current[id];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuttleSig]);

  // Apply the Oak Bluffs lock once the box arrives (it loads async from
  // /api/state, often after the map has already mounted).
  useEffect(() => {
    applyBoundsLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.south, bounds?.north, bounds?.east, bounds?.west]);

  // Redraw on any prop change.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shuttleSig,
    me?.lat,
    me?.lng,
    nomans.lat,
    nomans.lng,
    JSON.stringify(stops.map((s) => [s.id, s.position.lat, s.position.lng, s.status, s.name])),
  ]);

  function shuttleMarkerHtml(heading: number | null | undefined, stale = false): string {
    const rot = typeof heading === "number" && Number.isFinite(heading) ? heading : null;
    const fill = stale ? C.gilt : C.rust; // dim a parked/out-of-signal van
    const op = stale ? "opacity:0.45;" : "";
    // Arrow points up by default; CSS rotate aligns to compass heading.
    // When heading is unknown, render a plain dot.
    if (rot === null) {
      return `<div style="${op}width:20px;height:20px;border-radius:50%;background:${fill};border:3px solid ${C.paperDeep};box-shadow:0 0 0 1px rgba(0,0,0,0.45)"></div>`;
    }
    return `
      <div style="position:relative;width:32px;height:32px;${op}">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);transform-origin:50% 50%;">
          <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2 L23 24 L14 19 L5 24 Z" fill="${fill}" stroke="${C.paperDeep}" stroke-width="1.5" stroke-linejoin="round"/>
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

    add(nomans, iconsRef.current.nomans, "NoMans Restaurant");

    // One breadcrumb trail + one heading arrow per live van.
    for (const s of shuttles) {
      const trail = trailsRef.current[s.id] ?? [];
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

      const stale =
        typeof s.updatedAt === "number" && Date.now() - s.updatedAt > STALE_MS;
      const shuttleIcon = L.divIcon({
        className: stale ? "nomans-shuttle-marker stale" : "nomans-shuttle-marker",
        html: shuttleMarkerHtml(s.heading, stale),
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const name = s.label ?? "Combi";
      // Only show a speed for a fresh fix — a frozen speed on a parked/stale
      // van is misleading. Stale vans read "Combi · idle" instead.
      const label = stale
        ? `${name} · idle`
        : typeof s.speedMph === "number" && Number.isFinite(s.speedMph)
        ? `${name} · ${Math.round(s.speedMph)} mph`
        : name;
      const marker = L.marker([s.position.lat, s.position.lng], { icon: shuttleIcon })
        .addTo(map)
        // Permanent so each van's name floats beside it — lets you tell two
        // combis apart at a glance without tapping.
        .bindTooltip(label, {
          permanent: true,
          direction: "top",
          offset: [0, -14],
          className: stale ? "van-label stale" : "van-label",
        });
      layersRef.current.push(marker);
    }

    if (me) {
      const meMarker = L.marker([me.lat, me.lng], {
        icon: iconsRef.current.me,
        draggable: Boolean(onMeDrag),
        autoPan: true,
      })
        .addTo(map)
        .bindTooltip(onMeDrag ? "You — drag to adjust" : "You", {
          direction: "top",
          offset: [0, -8],
        });
      if (onMeDrag) {
        meMarker.on("dragend", () => {
          const ll = meMarker.getLatLng();
          onMeDrag({ lat: ll.lat, lng: ll.lng });
        });
      }
      layersRef.current.push(meMarker);
    }
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
