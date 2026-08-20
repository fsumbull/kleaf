"use client";
/* GES istemcisi — üretim izleme, karşılama oranı, fizibilite hesaplayıcı */
import { useState } from "react";
import Chart from "@/components/chart";
import { Card, CardTitle, KpiCard, EmptyState, Badge, Field, inputCls } from "@/components/ui";
import { gesFeasibility, gesCoverageRatio, GES_SATIS_TARIFE_TRY } from "@/lib/carbon/engine";
import { fmt1, fmtInt, fmtTRY, fmtTons } from "@/lib/format";

export interface GesFacility {
  id: string;
  name: string;
  installedKwp: number | null;
  commissionYear: number | null;
  capexTRY: number | null;
  uretimKwh: number;
  satisKwh: number;
  mahsupTCO2e: number;
}

export function GesClient({ year, facilities, monthly, sebekeKwh, elektrikFaktoru, elektrikFiyati, kwhPerKwp, capexPerKwp }: {
  year: number;
  facilities: GesFacility[];
  monthly: { month: string; kwh: number }[];
  sebekeKwh: number;
  elektrikFaktoru: number; // kg/kWh
  elektrikFiyati: number;  // TRY/kWh
  kwhPerKwp: number;       // kurum özgül üretim parametresi (kWh/kWp·yıl)
  capexPerKwp: number;     // kurum kurulum maliyeti (₺/kWp)
}) {
  const toplamKwp = facilities.reduce((a, f) => a + (f.installedKwp ?? 0), 0);
  const toplamUretim = facilities.reduce((a, f) => a + f.uretimKwh, 0);
  const toplamMahsup = facilities.reduce((a, f) => a + f.mahsupTCO2e, 0);
  const karsilama = gesCoverageRatio(toplamUretim, sebekeKwh); // üretim / (üretim + şebeke)
  const ozgulVerim = toplamKwp > 0 ? toplamUretim / toplamKwp : null; // kWh/kWp

  return (
    <>
      <div className="rise grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="kurulu güç" value={fmt1(toplamKwp)} unit="kWp" hint={`${facilities.length} GES tesisi`} />
        <KpiCard label="yıllık üretim" value={fmtInt(toplamUretim)} unit="kWh"
          hint={ozgulVerim != null ? `özgül verim ${fmtInt(ozgulVerim)} kWh/kWp (hedef ${fmtInt(kwhPerKwp)})` : undefined} />
        <KpiCard label="öz tüketim karşılama" value={karsilama != null ? fmt1(karsilama) : "—"} unit="%"
          hint={`üretim / (üretim + şebeke ${fmtInt(sebekeKwh)} kWh)`} />
        <KpiCard label="emisyon mahsubu" value={fmtTons(toplamMahsup)} unit="tCO₂e" hint={`${year} · şebeke faktörüyle`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="rise-1 lg:col-span-3">
          <CardTitle right={<span className="text-[11px] text-ink/40">kWh ve kWh/kWp · {year}</span>}>aylık üretim eğrisi</CardTitle>
          {monthly.every((m) => m.kwh === 0) ? (
            <EmptyState title="Bu yıl üretim kaydı yok" desc="GES_URETIM kategorisinde onaylı veri girildiğinde görünür." />
          ) : (
            <Chart height={250} option={{
              grid: { left: 56, right: 52, top: 30, bottom: 28 },
              tooltip: { trigger: "axis" },
              legend: { top: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11 } },
              xAxis: { type: "category", data: monthly.map((m) => m.month.slice(0, 3)), boundaryGap: false },
              yAxis: [
                { type: "value", name: "kWh", axisLabel: { fontSize: 10.5 } },
                { type: "value", name: "kWh/kWp", position: "right", splitLine: { show: false }, axisLabel: { fontSize: 10.5 } },
              ],
              series: [
                {
                  name: "üretim (kWh)", type: "line", smooth: true, data: monthly.map((m) => Math.round(m.kwh)),
                  lineStyle: { width: 3, color: "#eab308" }, itemStyle: { color: "#eab308" },
                  areaStyle: { opacity: 0.18, color: "#eab308" }, symbolSize: 6,
                  tooltip: { valueFormatter: (v: unknown) => `${fmtInt(Number(v))} kWh` },
                },
                ...(toplamKwp > 0 ? [{
                  name: "özgül verim (kWh/kWp)", type: "line" as const, smooth: true, yAxisIndex: 1,
                  data: monthly.map((m) => Number((m.kwh / toplamKwp).toFixed(1))),
                  lineStyle: { width: 2, type: "dashed" as const, color: "#16a34a" }, itemStyle: { color: "#16a34a" },
                  symbolSize: 4,
                  tooltip: { valueFormatter: (v: unknown) => `${fmt1(Number(v))} kWh/kWp` },
                }] : []),
              ],
            }} />
          )}
        </Card>

        <Card className="rise-2 lg:col-span-2">
          <CardTitle>tesisler</CardTitle>
          {facilities.length === 0 ? (
            <EmptyState title="GES tesisi tanımlı değil" desc="Tesis türü GES olan kayıtlar burada listelenir." />
          ) : (
            <ul className="space-y-3">
              {facilities.map((f) => (
                <li key={f.id} className="rounded-xl border border-leaf-100 bg-white/50 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-ink">{f.name}</p>
                    <Badge tone="leaf">{f.installedKwp ? `${fmt1(f.installedKwp)} kWp` : "kWp girilmedi"}</Badge>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11.5px] text-ink/55">
                    <span>üretim <strong className="block text-[12.5px] text-ink">{fmtInt(f.uretimKwh)} kWh</strong></span>
                    <span>satış <strong className="block text-[12.5px] text-ink">{fmtInt(f.satisKwh)} kWh</strong></span>
                    <span>mahsup <strong className="block text-[12.5px] text-leaf-700">−{fmtTons(f.mahsupTCO2e)} t</strong></span>
                  </div>
                  {(f.commissionYear || f.capexTRY) && (
                    <p className="mt-1.5 text-[11px] text-ink/40">
                      {f.commissionYear && <>devreye alma {f.commissionYear}</>}
                      {f.commissionYear && f.capexTRY ? " · " : ""}
                      {f.capexTRY ? <>yatırım {fmtTRY(f.capexTRY)}</> : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FeasibilityCalc elektrikFaktoru={elektrikFaktoru} elektrikFiyati={elektrikFiyati} kwhPerKwp={kwhPerKwp} capexPerKwp={capexPerKwp} />
    </>
  );
}

function FeasibilityCalc({ elektrikFaktoru, elektrikFiyati, kwhPerKwp, capexPerKwp }: {
  elektrikFaktoru: number; elektrikFiyati: number; kwhPerKwp: number; capexPerKwp: number;
}) {
  const [kwp, setKwp] = useState(500);
  const [ozTuketim, setOzTuketim] = useState(80);
  const [capex, setCapex] = useState<number | "">("");

  const r = gesFeasibility({
    kwp: Number.isFinite(kwp) ? kwp : 0,
    ozTuketimPct: Number.isFinite(ozTuketim) ? ozTuketim : 0,
    capexTRY: capex === "" ? undefined : capex,
    elektrikFaktoru,
    elektrikFiyatiTRY: elektrikFiyati,
    satisTarifesiTRY: GES_SATIS_TARIFE_TRY,
    kwhPerKwp,
    capexPerKwpTRY: capexPerKwp,
  });

  return (
    <Card className="rise-3 mt-4">
      <CardTitle right={<span className="text-[11px] text-ink/40">{fmtInt(kwhPerKwp)} kWh/kWp·yıl · {fmtTRY(capexPerKwp)}/kWp — kurum parametreleri (ayarlar)</span>}>
        yeni GES fizibilite hesaplayıcı
      </CardTitle>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3.5 lg:col-span-2">
          <Field label={`kurulu güç · ${fmt1(kwp)} kWp`}>
            <input type="range" min={50} max={5000} step={50} value={kwp}
              onChange={(e) => setKwp(Number(e.target.value))} className="w-full accent-leaf-600" />
          </Field>
          <Field label={`öz tüketim payı · %${fmtInt(ozTuketim)}`}>
            <input type="range" min={0} max={100} step={5} value={ozTuketim}
              onChange={(e) => setOzTuketim(Number(e.target.value))} className="w-full accent-leaf-600" />
          </Field>
          <Field label="yatırım tutarı (boşsa kurum ₺/kWp parametresi)">
            <input type="number" min={0} value={capex} placeholder={fmtInt(kwp * capexPerKwp)}
              onChange={(e) => setCapex(e.target.value === "" ? "" : Number(e.target.value))} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-3">
          <MiniStat label="yıllık üretim" value={`${fmtInt(r.uretimKwh)} kWh`} />
          <MiniStat label="emisyon azaltımı" value={`−${fmtTons(r.azaltimTCO2e)} tCO₂e/yıl`} accent />
          <MiniStat label="yıllık getiri" value={fmtTRY(r.gelirTRY)} hint={`öz tüketim ${fmtInt(r.ozTuketimKwh)} kWh + satış ${fmtInt(r.satisKwh)} kWh`} />
          <MiniStat label="geri ödeme" value={r.geriOdemeYil != null ? `${fmt1(r.geriOdemeYil)} yıl` : "—"} hint={`yatırım ${fmtTRY(r.capexTRY)}`} accent={r.geriOdemeYil != null && r.geriOdemeYil <= 6} />
        </div>
      </div>
    </Card>
  );
}

function MiniStat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${accent ? "border-leaf-200 bg-leaf-50" : "border-leaf-100 bg-white/50"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{label}</p>
      <p className={`mt-1 text-[19px] font-bold leading-tight tracking-tight ${accent ? "text-leaf-700" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink/40">{hint}</p>}
    </div>
  );
}
