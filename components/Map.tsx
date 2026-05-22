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
  nomans: LatLng;
  me?: LatLng | null;
  stops?: MapStop[];
  className?: string;
};

export default function Map({ shuttle, nomans, me, stops = [], className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const iconsRef = useRef<Record<string, any>>({});

  // One-time map initialization. Leaflet touches `window` so we have to
  // dynamic-import it inside an effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      leafletRef.current = L;

      const dot = (color: string) =>
        L.divIcon({
          className: "nomans-marker",
          html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #0e1116;box-shadow:0 0 0 1px rgba(0,0,0,0.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
      iconsRef.current = {
        shuttle: dot("#f2a93b"),
        nomans: dot("#3fb950"),
        me: dot("#58a6ff"),
        pickup: dot("#3fb950"),
        dropoff: dot("#f2a93b"),
      };

      const center = shuttle ?? me ?? nomans;
      const map = L.map(containerRef.current).setView([center.lat, center.lng], 14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
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

  // Redraw on any prop change. JSON.stringify of stops keeps the effect
  // identity stable when the parent re-renders with equal data.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shuttle?.lat,
    shuttle?.lng,
    me?.lat,
    me?.lng,
    nomans.lat,
    nomans.lng,
    JSON.stringify(stops.map((s) => [s.id, s.position.lat, s.position.lng, s.status, s.name])),
  ]);

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
    if (shuttle) add(shuttle, iconsRef.current.shuttle, "Combi shuttle");
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
