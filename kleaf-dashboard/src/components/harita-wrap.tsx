"use client";
/* Leaflet SSR uyumsuz — yalnız istemcide yükle */
import dynamic from "next/dynamic";
import type { HaritaTesis, HaritaMahalle } from "./harita-client";

const HaritaClient = dynamic(() => import("./harita-client").then((m) => m.HaritaClient), {
  ssr: false,
  loading: () => <div className="grid h-[560px] w-full place-items-center rounded-2xl border border-leaf-200/60 text-[13px] text-ink/40">harita yükleniyor…</div>,
});

export function HaritaWrap(props: { tesisler: HaritaTesis[]; mahalleler: HaritaMahalle[] }) {
  return <HaritaClient {...props} />;
}
