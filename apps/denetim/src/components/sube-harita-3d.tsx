"use client";
/* 3D şube açılım haritası — iki katmanlı (B3):
 *  Katman A ("ayak izi"): bankanın gerçek şubeleri (Facility) — kolon = yıllık tCO₂e
 *  Katman B ("fırsat"):  aday şehirler (BranchCandidate) — kolon = opportunity skoru
 * Harici bağımlılık yok: CSS 3D perspektif + eğik zemin + SVG ışık arkları. */
import { useMemo, useState } from "react";

export interface SubeCity {
  city: string;
  lat: number;
  lng: number;
  opportunity: number;
  demandScore: number;
  supplyScore: number;
  industryScore: number;
  population: number;
  status: string;
}

/** Bankanın gerçek şubesi (Facility) — Katman A verisi */
export interface SubeBranch {
  name: string;
  type: string; // BINA | TESIS ...
  lat: number;
  lng: number;
  tCO2e: number;   // yıllık toplam
  staff: number;
  areaM2: number;
  isHQ: boolean;   // Genel Müdürlük mü?
  isDC: boolean;   // Veri Merkezi mi?
}

// Türkiye sınır kutusu (kaba) — lat/lng → zemin yüzdesi
const LNG0 = 25.5, LNG1 = 45.2, LAT0 = 35.6, LAT1 = 42.4;
const px = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * 100;
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * 100;

// basitleştirilmiş Türkiye silüeti (bağlam için, düşük opaklık)
const TR_PATH =
  "M6,54 C10,44 16,40 24,41 C31,42 36,38 44,39 C52,40 58,36 66,38 C74,40 82,37 90,42 C96,46 97,52 93,57 C88,63 80,64 72,62 C64,60 58,64 50,63 C42,62 36,66 28,64 C18,61 8,62 6,54 Z";

const heat = (o: number) => (o >= 78 ? "#f59e0b" : o >= 62 ? "#84cc16" : o >= 50 ? "#22c55e" : "#16a34a");
// ayak izi ısı renkleri (yoğunluk = tCO2e/personel)
const heatFootprint = (intensity: number) => (intensity >= 8 ? "#dc2626" : intensity >= 4 ? "#f59e0b" : intensity >= 2 ? "#facc15" : "#22c55e");
const STATUS_LABEL: Record<string, string> = { MERKEZ: "merkez", ACILDI: "şube açık", PLANLANDI: "planlandı", ADAY: "aday" };

type Mode = "ayak-izi" | "firsat";

export function SubeHarita3D({ cities, branches }: { cities: SubeCity[]; branches?: SubeBranch[] }) {
  const hasBranches = (branches?.length ?? 0) > 0;
  const [mode, setMode] = useState<Mode>(hasBranches ? "ayak-izi" : "firsat");
  const [hover, setHover] = useState<SubeCity | null>(null);
  const [hoverBranch, setHoverBranch] = useState<SubeBranch | null>(null);
  const hqCity = useMemo(() => cities.find((c) => c.status === "MERKEZ") ?? cities[0], [cities]);
  const hqBranch = useMemo(() => branches?.find((b) => b.isHQ) ?? branches?.[0], [branches]);
  const topAday = useMemo(
    () => [...cities].filter((c) => c.status !== "MERKEZ").sort((a, b) => b.opportunity - a.opportunity).slice(0, 6),
    [cities]
  );
  const sirali = useMemo(() => [...cities].sort((a, b) => b.opportunity - a.opportunity), [cities]);
  const maxTCO2e = useMemo(() => Math.max(1, ...(branches ?? []).map((b) => b.tCO2e)), [branches]);
  const sirBranch = useMemo(() => [...(branches ?? [])].sort((a, b) => b.tCO2e - a.tCO2e), [branches]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
      <div className="sh3d-stage">
        <style>{sh3dCSS}</style>

        {/* katman toggle */}
        {hasBranches && (
          <div className="sh3d-toggle">
            <button type="button"
              onClick={() => setMode("ayak-izi")}
              className={mode === "ayak-izi" ? "on" : ""}>ayak izi</button>
            <button type="button"
              onClick={() => setMode("firsat")}
              className={mode === "firsat" ? "on" : ""}>fırsat</button>
          </div>
        )}

        <div className="sh3d-scene">
          <div className="sh3d-plane">
            {/* zemin ızgara + Türkiye silüeti + arklar */}
            <svg className="sh3d-ground" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <defs>
                <radialGradient id="shGlow" cx="50%" cy="45%" r="65%">
                  <stop offset="0%" stopColor="#064e3b" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#022c22" stopOpacity="0.5" />
                </radialGradient>
                <linearGradient id="shArc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="#86efac" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="shArcOp" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
                  <stop offset="50%" stopColor="#7dd3fc" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="url(#shGlow)" />
              {Array.from({ length: 11 }).map((_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#10b981" strokeOpacity="0.12" strokeWidth="0.15" />
              ))}
              {Array.from({ length: 11 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#10b981" strokeOpacity="0.12" strokeWidth="0.15" />
              ))}
              <path d={TR_PATH} fill="#34d399" fillOpacity="0.07" stroke="#6ee7b7" strokeOpacity="0.35" strokeWidth="0.4" />
              {mode === "firsat" && hqCity && renderFirsatArks(topAday, hqCity)}
              {mode === "ayak-izi" && hqBranch && renderOpArks(branches ?? [], hqBranch)}
            </svg>

            {/* şehir/şube kolonları */}
            {mode === "firsat" && cities.map((c) => {
              const h = Math.round(16 + Math.max(0, c.opportunity - 28) * 1.7);
              const col = heat(c.opportunity);
              const isHQ = c.status === "MERKEZ";
              return (
                <div key={c.city} className="sh3d-city" style={{ left: `${px(c.lng)}%`, top: `${py(c.lat)}%` }}
                  onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  <span className="sh3d-base" style={{ background: col, boxShadow: `0 0 12px 2px ${col}aa` }} />
                  <span className="sh3d-col" style={{ height: h, background: `linear-gradient(to top, ${col}, ${col}22)`, boxShadow: `0 0 10px ${col}88` }} />
                  <span className="sh3d-cap" style={{ bottom: h + 2, background: col, boxShadow: `0 0 10px 2px ${col}` }} />
                  {isHQ && <span className="sh3d-ring" style={{ borderColor: col }} />}
                  <span className="sh3d-label" style={{ bottom: h + 8 }}>{c.city}</span>
                </div>
              );
            })}

            {mode === "ayak-izi" && (branches ?? []).map((b) => {
              const oran = b.tCO2e / maxTCO2e;
              const h = Math.round(24 + oran * 90);
              const yogunluk = b.staff > 0 ? b.tCO2e / b.staff : 0;
              const col = heatFootprint(yogunluk);
              return (
                <div key={b.name} className="sh3d-city" style={{ left: `${px(b.lng)}%`, top: `${py(b.lat)}%` }}
                  onMouseEnter={() => setHoverBranch(b)} onMouseLeave={() => setHoverBranch(null)}>
                  <span className="sh3d-base" style={{ background: col, boxShadow: `0 0 12px 2px ${col}aa`, width: b.isHQ ? 10 : b.isDC ? 8 : 6, height: b.isHQ ? 10 : b.isDC ? 8 : 6, left: b.isHQ ? -5 : b.isDC ? -4 : -3, top: b.isHQ ? -5 : b.isDC ? -4 : -3 }} />
                  <span className="sh3d-col" style={{ height: h, background: `linear-gradient(to top, ${col}, ${col}22)`, boxShadow: `0 0 10px ${col}88`, width: b.isHQ ? 5 : 3, left: b.isHQ ? -2.5 : -1.5 }} />
                  <span className="sh3d-cap" style={{ bottom: h + 2, background: col, boxShadow: `0 0 10px 2px ${col}` }} />
                  {b.isHQ && <span className="sh3d-ring" style={{ borderColor: col }} />}
                  {b.isDC && <span className="sh3d-dc-tag" style={{ bottom: h + 22 }}>DC</span>}
                  <span className="sh3d-label" style={{ bottom: h + 8 }}>{b.name.replace(/İstanbul |Ankara |İzmir /, "")}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* hover kartı */}
        {mode === "firsat" && hover && (
          <div className="sh3d-tip">
            <div className="flex items-center justify-between gap-4">
              <b className="text-[13px]">{hover.city}</b>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">{STATUS_LABEL[hover.status] ?? hover.status}</span>
            </div>
            <div className="mt-1 text-[11px] opacity-80">fırsat skoru <b className="text-[13px]">{hover.opportunity}</b>/100 · nüfus {(hover.population / 1_000_000).toFixed(1)}M</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
              <Metric label="talep" v={hover.demandScore} />
              <Metric label="arz" v={hover.supplyScore} />
              <Metric label="sanayi" v={hover.industryScore} />
            </div>
          </div>
        )}

        {mode === "ayak-izi" && hoverBranch && (
          <div className="sh3d-tip">
            <div className="flex items-center justify-between gap-4">
              <b className="text-[13px]">{hoverBranch.name}</b>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">
                {hoverBranch.isHQ ? "merkez" : hoverBranch.isDC ? "veri merkezi" : "şube"}
              </span>
            </div>
            <div className="mt-1 text-[11px] opacity-80">yıllık ayak izi <b className="text-[13px]">{hoverBranch.tCO2e.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</b> tCO₂e</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
              <Metric label="personel" v={hoverBranch.staff} />
              <Metric label="m²" v={hoverBranch.areaM2} />
              <Metric label="t/kişi" v={hoverBranch.staff > 0 ? Math.round((hoverBranch.tCO2e / hoverBranch.staff) * 10) / 10 : 0} />
            </div>
          </div>
        )}

        <div className="sh3d-legend">
          {mode === "firsat" ? (
            <>
              <span><i style={{ background: "#16a34a" }} /> düşük</span>
              <span><i style={{ background: "#22c55e" }} /> orta</span>
              <span><i style={{ background: "#84cc16" }} /> yüksek</span>
              <span><i style={{ background: "#f59e0b" }} /> öncelikli</span>
            </>
          ) : (
            <>
              <span><i style={{ background: "#22c55e" }} /> düşük yoğ.</span>
              <span><i style={{ background: "#facc15" }} /> orta yoğ.</span>
              <span><i style={{ background: "#f59e0b" }} /> yüksek yoğ.</span>
              <span><i style={{ background: "#dc2626" }} /> kritik yoğ.</span>
            </>
          )}
        </div>
      </div>

      {/* sağ sütun — moda göre değişen liste */}
      <div className="rounded-2xl border border-leaf-200/60 bg-white/60 p-4">
        {mode === "firsat" ? (
          <>
            <p className="eyebrow mb-2">şube açılım fırsat sıralaması</p>
            <ul className="space-y-1.5">
              {sirali.map((c, i) => (
                <li key={c.city} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-leaf-50"
                  onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  <span className="w-5 text-right text-[12px] font-bold text-ink/40">{i + 1}</span>
                  <span className="flex-1 text-[13px] font-medium text-ink">{c.city}</span>
                  <span className="text-[10.5px] text-ink/45">{STATUS_LABEL[c.status] ?? c.status}</span>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-leaf-100">
                    <span className="block h-full rounded-full" style={{ width: `${c.opportunity}%`, background: heat(c.opportunity) }} />
                  </span>
                  <span className="w-8 text-right text-[12px] font-bold" style={{ color: heat(c.opportunity) }}>{c.opportunity}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="eyebrow mb-2">şube ayak izi sıralaması</p>
            <ul className="space-y-1.5">
              {sirBranch.map((b, i) => {
                const yogunluk = b.staff > 0 ? b.tCO2e / b.staff : 0;
                const col = heatFootprint(yogunluk);
                const oran = b.tCO2e / (sirBranch[0]?.tCO2e || 1);
                return (
                  <li key={b.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-leaf-50"
                    onMouseEnter={() => setHoverBranch(b)} onMouseLeave={() => setHoverBranch(null)}>
                    <span className="w-5 text-right text-[12px] font-bold text-ink/40">{i + 1}</span>
                    <span className="flex-1 text-[13px] font-medium text-ink">{b.name}</span>
                    <span className="text-[10.5px] text-ink/45">{b.isHQ ? "merkez" : b.isDC ? "DC" : "şube"}</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-leaf-100">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(6, oran * 100)}%`, background: col }} />
                    </span>
                    <span className="w-14 text-right text-[11.5px] font-bold" style={{ color: col }}>{b.tCO2e >= 1000 ? Math.round(b.tCO2e).toLocaleString("tr-TR") : b.tCO2e.toFixed(1)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, v }: { label: string; v: number }) {
  return (
    <span className="rounded-lg bg-white/10 px-1.5 py-1 text-center">
      <span className="block opacity-70">{label}</span>
      <b className="text-[12px]">{v >= 1000 ? Math.round(v).toLocaleString("tr-TR") : v}</b>
    </span>
  );
}

// merkez → top aday arkları (fırsat modu)
function renderFirsatArks(top: SubeCity[], hq: SubeCity) {
  const x0 = px(hq.lng), y0 = py(hq.lat);
  return (
    <>
      {top.map((c, i) => {
        const x1 = px(c.lng), y1 = py(c.lat);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 10 - i;
        return (
          <path key={c.city} d={`M${x0},${y0} Q${mx},${my} ${x1},${y1}`} fill="none"
            stroke="url(#shArc)" strokeWidth="0.5" strokeLinecap="round"
            strokeDasharray="2 3" className="sh3d-arc" style={{ animationDelay: `${i * 0.35}s` }} />
        );
      })}
    </>
  );
}

// GM → gerçek şubeler arkları (operasyon ağı modu) — solid + mavi
function renderOpArks(all: SubeBranch[], hq: SubeBranch) {
  const others = all.filter((b) => b !== hq);
  const x0 = px(hq.lng), y0 = py(hq.lat);
  return (
    <>
      {others.map((b, i) => {
        const x1 = px(b.lng), y1 = py(b.lat);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 8 - i;
        return (
          <path key={b.name} d={`M${x0},${y0} Q${mx},${my} ${x1},${y1}`} fill="none"
            stroke="url(#shArcOp)" strokeWidth="0.55" strokeLinecap="round"
            className="sh3d-arc-solid" />
        );
      })}
    </>
  );
}

const sh3dCSS = `
.sh3d-stage{position:relative;border-radius:20px;overflow:hidden;min-height:460px;
  background:radial-gradient(120% 90% at 50% -10%,#0b3b2e 0%,#052018 55%,#020f0b 100%);
  border:1px solid rgba(16,185,129,.2);box-shadow:inset 0 1px 30px rgba(16,185,129,.08);padding:22px;}
.sh3d-toggle{position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:6;display:inline-flex;
  padding:3px;border-radius:999px;background:rgba(3,20,15,.7);border:1px solid rgba(52,211,153,.25);backdrop-filter:blur(8px);}
.sh3d-toggle button{appearance:none;border:0;background:transparent;color:#a7f3d0;font-size:11.5px;font-weight:600;
  padding:5px 14px;border-radius:999px;cursor:pointer;letter-spacing:.02em;transition:all .18s;}
.sh3d-toggle button.on{background:#16a34a;color:#fff;box-shadow:0 4px 14px -3px rgba(22,163,74,.7);}
.sh3d-scene{perspective:1300px;perspective-origin:50% 30%;height:420px;display:grid;place-items:center;}
.sh3d-plane{position:relative;width:88%;aspect-ratio:16/10;transform-style:preserve-3d;
  transform:rotateX(56deg) rotateZ(-6deg);animation:sh3dFloat 14s ease-in-out infinite;}
@keyframes sh3dFloat{0%,100%{transform:rotateX(56deg) rotateZ(-6deg)}50%{transform:rotateX(53deg) rotateZ(-3deg)}}
.sh3d-ground{position:absolute;inset:0;width:100%;height:100%;border-radius:8px;overflow:visible;}
.sh3d-arc{animation:sh3dDash 2.4s linear infinite;filter:drop-shadow(0 0 1px #86efac);}
.sh3d-arc-solid{filter:drop-shadow(0 0 1.5px #7dd3fc);}
@keyframes sh3dDash{to{stroke-dashoffset:-25}}
.sh3d-city{position:absolute;transform:translate(-50%,-50%);transform-style:preserve-3d;cursor:pointer;}
.sh3d-base{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;}
.sh3d-col{position:absolute;left:-1.5px;bottom:0;width:3px;border-radius:2px;transform:rotateX(-56deg);transform-origin:bottom;}
.sh3d-cap{position:absolute;left:-2.5px;width:5px;height:5px;border-radius:50%;transform:rotateX(-56deg);transform-origin:bottom;}
.sh3d-ring{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;border:1.5px solid;opacity:.7;animation:sh3dPulse 2s ease-out infinite;}
.sh3d-dc-tag{position:absolute;left:50%;transform:translateX(-50%) rotateX(-56deg);transform-origin:bottom;white-space:nowrap;
  font-size:7.5px;font-weight:700;color:#38bdf8;letter-spacing:.05em;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.6);}
@keyframes sh3dPulse{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.8);opacity:0}}
.sh3d-label{position:absolute;left:50%;transform:translateX(-50%) rotateX(-56deg);transform-origin:bottom;white-space:nowrap;
  font-size:8.5px;font-weight:600;color:#d1fae5;text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none;}
.sh3d-tip{position:absolute;top:16px;right:16px;z-index:5;min-width:180px;padding:12px 14px;border-radius:14px;
  background:rgba(6,40,30,.86);backdrop-filter:blur(10px);border:1px solid rgba(52,211,153,.3);color:#ecfdf5;
  box-shadow:0 16px 40px -16px rgba(0,0,0,.6);}
.sh3d-legend{position:absolute;bottom:14px;left:16px;display:flex;gap:12px;font-size:10.5px;color:#a7f3d0;}
.sh3d-legend span{display:flex;align-items:center;gap:5px;}
.sh3d-legend i{width:9px;height:9px;border-radius:50%;display:inline-block;}
`;
