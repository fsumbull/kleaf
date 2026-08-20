"use client";
/* Binalar istemcisi — enerji yoğunluğu karşılaştırma ve tasarruf hedefi izleme */
import Chart from "@/components/chart";
import { Card, CardTitle, KpiCard, EmptyState, Table, Badge } from "@/components/ui";
import { savingsTargetProgress, GAZ_KWH_PER_M3 } from "@/lib/carbon/engine";
import { fmt1, fmtInt } from "@/lib/format";

export interface BinaRow {
  id: string;
  name: string;
  type: string;
  areaM2: number | null;
  staffCount: number | null;
  kwhEq: number;        // toplam enerji (kWh eşdeğeri)
  elektrikKwh: number;
  dogalgazM3: number;
  tCO2e: number;
  bazKwhEq: number | null; // baz yıl kWh eşdeğeri (tasarruf hedefi için)
}

export function BinalarClient({ year, baselineYear, rows, hedefPct }: {
  year: number;
  baselineYear: number;
  rows: BinaRow[];
  hedefPct: number;
}) {
  const toplamKwhEq = rows.reduce((a, r) => a + r.kwhEq, 0);
  const toplamBaz = rows.reduce((a, r) => a + (r.bazKwhEq ?? 0), 0);
  const toplamTCO2e = rows.reduce((a, r) => a + r.tCO2e, 0);
  const tasarrufPct = toplamBaz > 0 ? ((toplamBaz - toplamKwhEq) / toplamBaz) * 100 : null;
  const hedefIlerlemeRaw = savingsTargetProgress(toplamBaz, toplamKwhEq, hedefPct);
  const hedefIlerleme = hedefIlerlemeRaw != null ? Math.max(0, Math.min(100, hedefIlerlemeRaw)) : null;

  const sorted = [...rows].sort((a, b) => yogunluk(b) - yogunluk(a));

  return (
    <>
      <div className="rise grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="toplam enerji" value={fmtInt(toplamKwhEq)} unit="kWh eşd."
          hint={`${rows.length} bina/kampüs · elektrik + doğalgaz`} />
        <KpiCard label="bina emisyonu" value={fmt1(toplamTCO2e)} unit="tCO₂e" hint={`${year}`} />
        <KpiCard label="baz yıla göre tasarruf" value={tasarrufPct != null ? fmt1(tasarrufPct) : "—"} unit="%"
          tone={tasarrufPct != null && tasarrufPct > 0 ? "leaf" : "warm"}
          hint={`baz ${baselineYear}: ${fmtInt(toplamBaz)} kWh eşd.`} />
        <KpiCard label="tasarruf hedefi ilerleme" value={hedefIlerlemeRaw != null ? fmtInt(hedefIlerlemeRaw) : "—"} unit="%"
          tone={hedefIlerlemeRaw != null && hedefIlerlemeRaw >= 100 ? "leaf" : "warm"}
          hint={`kurum hedefi %${fmt1(hedefPct)} tasarruf`} />
      </div>

      {hedefIlerleme != null && (
        <Card className="rise-1 mt-4">
          <CardTitle right={<span className="text-[11px] text-ink/40">hedef: baz yıla göre %{fmt1(hedefPct)} enerji tasarrufu</span>}>
            enerji tasarruf hedefi
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-leaf-100">
              <div className="h-full rounded-full bg-gradient-to-r from-leaf-600 to-leaf-400 transition-all" style={{ width: `${hedefIlerleme}%` }} />
            </div>
            <span className="shrink-0 text-[13px] font-bold text-leaf-700">%{fmtInt(hedefIlerleme)}</span>
          </div>
          <p className="mt-2 text-[12px] text-ink/50">
            Gerçekleşen tasarruf %{fmt1(tasarrufPct ?? 0)} · hedefe {tasarrufPct != null && tasarrufPct >= hedefPct ? "ulaşıldı" : `%${fmt1(Math.max(0, hedefPct - (tasarrufPct ?? 0)))} kaldı`}
          </p>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="rise-2">
          <CardTitle right={<span className="text-[11px] text-ink/40">kWh eşd. · {year}</span>}>elektrik / doğalgaz dağılımı</CardTitle>
          {sorted.length === 0 ? (
            <EmptyState title="Enerji verisi olan bina yok" desc="ELEKTRIK veya DOGALGAZ kaydı girildiğinde görünür." />
          ) : (
            <Chart height={Math.max(180, sorted.length * 40 + 70)} option={{
              grid: { left: 170, right: 24, top: 34, bottom: 28 },
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${fmtInt(Number(v))} kWh eşd.` },
              legend: { top: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11 } },
              xAxis: { type: "value", axisLabel: { fontSize: 10.5 } },
              yAxis: {
                type: "category",
                data: sorted.map((r) => r.name).reverse(),
                axisLabel: { width: 150, overflow: "truncate" },
              },
              series: [
                {
                  name: "elektrik", type: "bar", stack: "enerji",
                  data: sorted.map((r) => Math.round(r.elektrikKwh)).reverse(),
                  itemStyle: { color: "#16a34a" }, barWidth: "55%",
                },
                {
                  name: "doğalgaz (kWh eşd.)", type: "bar", stack: "enerji",
                  data: sorted.map((r) => Math.round(r.dogalgazM3 * GAZ_KWH_PER_M3)).reverse(),
                  itemStyle: { color: "#f59e0b", borderRadius: [0, 6, 6, 0] },
                },
              ],
            }} />
          )}
        </Card>

        <Card className="rise-2">
          <CardTitle right={<span className="text-[11px] text-ink/40">kWh eşd. / m² · {year}</span>}>enerji yoğunluğu karşılaştırması</CardTitle>
          {sorted.filter((r) => r.areaM2).length === 0 ? (
            <EmptyState title="m² bilgisi olan bina yok" desc="Tesis kartlarında alan bilgisi girildiğinde yoğunluk karşılaştırması yapılır." />
          ) : (
            <Chart height={Math.max(180, sorted.filter((r) => r.areaM2).length * 44 + 60)} option={{
              grid: { left: 170, right: 60, top: 10, bottom: 28 },
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${fmt1(Number(v))} kWh/m²` },
              xAxis: { type: "value" },
              yAxis: {
                type: "category",
                data: sorted.filter((r) => r.areaM2).map((r) => r.name).reverse(),
                axisLabel: { width: 150, overflow: "truncate" },
              },
              series: [{
                type: "bar",
                data: sorted.filter((r) => r.areaM2).map((r) => +yogunluk(r).toFixed(1)).reverse(),
                itemStyle: { borderRadius: [0, 6, 6, 0], color: "#16a34a" },
                barWidth: "55%",
                label: { show: true, position: "right", formatter: "{c}", fontSize: 11, color: "#64748b" },
              }],
            }} />
          )}
        </Card>
      </div>

      <Card className="rise-3 mt-4" pad={false}>
        <div className="px-5 pt-4">
          <h2 className="text-[14px] font-bold tracking-tight text-ink">bina envanteri · {year}</h2>
        </div>
        <div className="p-2">
          <Table dense head={<>
            <th>bina</th>
            <th className="text-right">alan (m²)</th>
            <th className="text-right">elektrik (kWh)</th>
            <th className="text-right">doğalgaz (m³)</th>
            <th className="text-right">toplam (kWh eşd.)</th>
            <th className="text-right">kWh/m²</th>
            <th className="text-right">baz yıla göre</th>
          </>}>
            {sorted.map((r) => {
              const delta = r.bazKwhEq && r.bazKwhEq > 0 ? ((r.kwhEq - r.bazKwhEq) / r.bazKwhEq) * 100 : null;
              return (
                <tr key={r.id}>
                  <td className="max-w-[220px] truncate font-medium">{r.name}</td>
                  <td className="text-right tabular-nums">{r.areaM2 ? fmtInt(r.areaM2) : "—"}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.elektrikKwh)}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.dogalgazM3)}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.kwhEq)}</td>
                  <td className="text-right tabular-nums">{r.areaM2 ? fmt1(yogunluk(r)) : "—"}</td>
                  <td className="text-right">
                    {delta == null ? <span className="text-ink/30">—</span> : (
                      <Badge tone={delta <= 0 ? "leaf" : "warm"}>{delta > 0 ? "+" : ""}{fmt1(delta)}%</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
      </Card>
    </>
  );
}

function yogunluk(r: BinaRow): number {
  return r.areaM2 && r.areaM2 > 0 ? r.kwhEq / r.areaM2 : 0;
}
