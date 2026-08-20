"use client";
/* Atık yönetimi istemcisi — akış grafikleri ve saptırma analizi */
import Chart from "@/components/chart";
import { Card, CardTitle, KpiCard, EmptyState, Table, Badge } from "@/components/ui";
import { fmt1, fmtInt, fmtTRY, fmtTons } from "@/lib/format";

export interface AtikMonthly { month: string; depolama: number; geriDonusum: number; kompost: number }
export interface AtikFacilityRow {
  facility: string;
  depolamaTon: number;
  geriDonusumTon: number;
  kompostTon: number;
  netTCO2e: number;
}

export function AtikClient({ year, totals, monthly, facilities, bertarafTRYPerTon }: {
  year: number;
  totals: {
    depolamaTon: number; geriDonusumTon: number; kompostTon: number;
    depolamaTCO2e: number; krediTCO2e: number; organikPotansiyelTon: number;
  };
  monthly: AtikMonthly[];
  facilities: AtikFacilityRow[];
  bertarafTRYPerTon: number;
}) {
  const toplamTon = totals.depolamaTon + totals.geriDonusumTon + totals.kompostTon;
  const saptirmaPct = toplamTon > 0 ? ((totals.geriDonusumTon + totals.kompostTon) / toplamTon) * 100 : 0;
  const netTCO2e = totals.depolamaTCO2e - totals.krediTCO2e;
  const bertarafTRY = totals.depolamaTon * bertarafTRYPerTon;

  return (
    <>
      <div className="rise grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="toplam atık akışı" value={fmt1(toplamTon)} unit="ton" hint={`${year} · depolama + saptırma`} />
        <KpiCard label="saptırma oranı" value={fmt1(saptirmaPct)} unit="%" tone={saptirmaPct >= 20 ? "leaf" : "warm"}
          hint="geri dönüşüm + kompost payı" />
        <KpiCard label="net atık emisyonu" value={fmtTons(netTCO2e)} unit="tCO₂e"
          hint={`depolama ${fmtTons(totals.depolamaTCO2e)} − kredi ${fmtTons(totals.krediTCO2e)}`} />
        <KpiCard label="bertaraf maliyeti" value={fmtTRY(bertarafTRY)} unit="/yıl"
          hint={`${fmtTRY(bertarafTRYPerTon)}/ton × depolanan`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="rise-1 lg:col-span-3">
          <CardTitle right={<span className="text-[11px] text-ink/40">ton / ay · {year}</span>}>aylık atık akışı</CardTitle>
          {monthly.every((m) => m.depolama + m.geriDonusum + m.kompost === 0) ? (
            <EmptyState title="Bu yıl atık kaydı yok" desc="ATIK, GERI_DONUSUM veya KOMPOST kategorisinde onaylı veri girildiğinde görünür." />
          ) : (
            <Chart height={250} option={{
              grid: { left: 44, right: 12, top: 28, bottom: 44 },
              tooltip: { trigger: "axis", valueFormatter: (v) => `${fmt1(Number(v))} ton` },
              legend: { bottom: 0, icon: "circle" },
              xAxis: { type: "category", data: monthly.map((m) => m.month.slice(0, 3)) },
              yAxis: { type: "value" },
              series: [
                { name: "depolama", type: "bar", stack: "t", data: monthly.map((m) => +m.depolama.toFixed(1)), itemStyle: { color: "#9ca3af" } },
                { name: "geri dönüşüm", type: "bar", stack: "t", data: monthly.map((m) => +m.geriDonusum.toFixed(1)), itemStyle: { color: "#16a34a" } },
                { name: "kompost", type: "bar", stack: "t", data: monthly.map((m) => +m.kompost.toFixed(1)), itemStyle: { color: "#84cc16", borderRadius: [5, 5, 0, 0] } },
              ],
            }} />
          )}
        </Card>
        <Card className="rise-2 lg:col-span-2">
          <CardTitle>saptırma potansiyeli</CardTitle>
          <div className="space-y-3 text-[13px] text-ink/70">
            <p>
              Depolanan atığın yaklaşık <strong className="text-ink">%45&apos;i organik</strong> kabul edilir.
              Bu yıl depolanan {fmt1(totals.depolamaTon)} tonun organik payı tahmini{" "}
              <strong className="text-leaf-700">{fmt1(totals.organikPotansiyelTon)} ton</strong>.
            </p>
            <p>
              Bu pay komposta yönlendirilse yıllık{" "}
              <strong className="text-leaf-700">−{fmt1(totals.organikPotansiyelTon * 0.42)} tCO₂e</strong> azaltım ve{" "}
              <strong className="text-leaf-700">{fmtTRY(totals.organikPotansiyelTon * bertarafTRYPerTon)}</strong>{" "}
              bertaraf tasarrufu sağlanır.
            </p>
            <p className="rounded-xl bg-leaf-50 px-3 py-2 text-[12px] text-leaf-800">
              Senaryolar sayfasındaki <em>kompost saptırma</em> kaldıracı ile hedef bazlı simülasyon yapabilirsiniz.
            </p>
          </div>
        </Card>
      </div>

      <Card className="rise-3 mt-4" pad={false}>
        <div className="px-5 pt-4">
          <h2 className="text-[14px] font-bold tracking-tight text-ink">tesis bazında atık akışı · {year}</h2>
        </div>
        {facilities.length === 0 ? (
          <EmptyState title="Atık verisi olan tesis yok" />
        ) : (
          <div className="p-2">
            <Table dense head={<>
              <th>tesis</th>
              <th className="text-right">depolama (ton)</th>
              <th className="text-right">geri dönüşüm (ton)</th>
              <th className="text-right">kompost (ton)</th>
              <th className="text-right">saptırma</th>
              <th className="text-right">net tCO₂e</th>
            </>}>
              {facilities.map((f) => {
                const tot = f.depolamaTon + f.geriDonusumTon + f.kompostTon;
                const pct = tot > 0 ? ((f.geriDonusumTon + f.kompostTon) / tot) * 100 : 0;
                return (
                  <tr key={f.facility}>
                    <td className="max-w-[240px] truncate font-medium">{f.facility}</td>
                    <td className="text-right tabular-nums">{fmt1(f.depolamaTon)}</td>
                    <td className="text-right tabular-nums">{fmt1(f.geriDonusumTon)}</td>
                    <td className="text-right tabular-nums">{fmt1(f.kompostTon)}</td>
                    <td className="text-right">
                      <Badge tone={pct >= 20 ? "leaf" : pct > 0 ? "warm" : "gray"}>%{fmtInt(pct)}</Badge>
                    </td>
                    <td className="text-right tabular-nums">{fmtTons(f.netTCO2e)}</td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
