"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { TYPE_COLORS } from "./lib/classify";
import type { Tower } from "./lib/types";

interface Props {
  towers: Tower[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const KOREA_CENTER: [number, number] = [36.35, 127.8];

export default function TowerMap({ towers, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 지도 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, minZoom: 6 }).setView(KOREA_CENTER, 7);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      renderMarkers();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMarkers() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    for (const t of towers) {
      const m = L.circleMarker([t.lat, t.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: TYPE_COLORS[t.towerType],
        fillOpacity: 0.95,
      })
        .bindTooltip(`${t.bldName} · ${t.height}m`, { direction: "top", offset: [0, -6] })
        .on("click", () => onSelectRef.current(t.gisId))
        .addTo(map);
      markersRef.current.set(t.gisId, m);
    }
    if (towers.length > 0) {
      const bounds = L.latLngBounds(towers.map((t) => [t.lat, t.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }

  // 필터 결과가 바뀌면 마커 갱신
  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towers]);

  // 선택 강조 + 이동
  useEffect(() => {
    const map = mapRef.current;
    markersRef.current.forEach((m, id) => {
      const sel = id === selectedId;
      m.setStyle({ radius: sel ? 11 : 7, weight: sel ? 3 : 2, color: sel ? "#111" : "#fff" });
      if (sel) m.bringToFront();
    });
    const t = towers.find((x) => x.gisId === selectedId);
    if (map && t) map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [selectedId, towers]);

  return <div ref={containerRef} className="absolute inset-0" aria-label="탑 위치 지도" role="region" />;
}
