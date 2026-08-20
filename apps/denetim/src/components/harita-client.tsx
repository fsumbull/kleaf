"use client";
/* Emisyon haritası — Leaflet + OpenStreetMap; tesis marker'ları + mahalle koroplet daireleri */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtTons, fmtInt } from "@/lib/format";

export interface HaritaTesis {
  id: string; name: string; type: string; lat: number; lng: number; tCO2e: number;
}
export interface HaritaMahalle {
  name: string; population: number; lat: number; lng: number; tCO2e: number;
}

export function HaritaClient({ tesisler, mahalleler }: {
  tesisler: HaritaTesis[]; mahalleler: HaritaMahalle[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const all = [...tesisler, ...mahalleler];
    const center: [number, number] = all.length
      ? [all.reduce((s, p) => s + p.lat, 0) / all.length, all.reduce((s, p) => s + p.lng, 0) / all.length]
      : [39.6, 32.9];

    const map = L.map(ref.current).setView(center, 13);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    /* mahalle koroplet daireleri — kişi başı emisyona göre renk */
    const maxPerCapita = Math.max(...mahalleler.map((m) => m.tCO2e / Math.max(1, m.population)), 1e-9);
    for (const m of mahalleler) {
      const perCapita = m.tCO2e / Math.max(1, m.population);
      const ratio = perCapita / maxPerCapita;
      const color = ratio > 0.66 ? "#dc2626" : ratio > 0.33 ? "#f59e0b" : "#16a34a";
      L.circle([m.lat, m.lng], {
        radius: Math.sqrt(m.population) * 12, color, weight: 1.5, fillColor: color, fillOpacity: 0.18,
      }).addTo(map).bindPopup(
        `<b>${m.name}</b><br/>nüfus: ${fmtInt(m.population)}<br/>tahmini emisyon: ${fmtTons(m.tCO2e)} tCO₂e<br/>kişi başı: ${(perCapita * 1000).toFixed(1)} kgCO₂e`
      );
    }

    /* tesis marker'ları — emisyona göre boyutlu daire işaretçi */
    const maxT = Math.max(...tesisler.map((t) => Math.abs(t.tCO2e)), 1e-9);
    for (const t of tesisler) {
      const kredi = t.tCO2e < 0;
      L.circleMarker([t.lat, t.lng], {
        radius: 6 + 14 * Math.sqrt(Math.abs(t.tCO2e) / maxT),
        color: kredi ? "#16a34a" : "#1d4ed8", weight: 2,
        fillColor: kredi ? "#22c55e" : "#3b82f6", fillOpacity: 0.5,
      }).addTo(map).bindPopup(
        `<b>${t.name}</b><br/>${t.type}<br/>${kredi ? "mahsup" : "emisyon"}: ${fmtTons(t.tCO2e)} tCO₂e`
      );
    }

    return () => { map.remove(); mapRef.current = null; };
  }, [tesisler, mahalleler]);

  return <div ref={ref} className="h-[560px] w-full rounded-2xl border border-leaf-200/60" />;
}
