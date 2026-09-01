"use client";
/* Belediye kıyaslama istemcisi — kişi başı emisyon bar grafiği + karşılaştırma tablosu */
import Chart from "@/components/chart";
import { Card, CardTitle, Table, Badge } from "@/components/ui";
import { fmtInt, fmt1, fmtTons } from "@/lib/format";

export interface KiyasRow {
  orgId: string;
  name: string;
  kendisi: boolean;
  netZeroYear: number;
  netTCO2e: number;
  brutTCO2e: number;
  nufus: number;
  kisiBasiKg: number | null; // kg CO2e / kişi
  onayOranPct: number | null;
  belgeOranPct: number | null;
  mahsupTCO2e: number;
}

export function KiyasClient({ rows, year }: { rows: KiyasRow[]; year: number }) {
  const sirali = [...rows].sort((a, b) => (a.kisiBasiKg ?? Infinity) - (b.kisiBasiKg ?? Infinity));

  return (
    <div className="rise-2 space-y-4">
      <Card>
        <CardTitle>kişi başı kurumsal emisyon · {year}</CardTitle>
        <Chart
          height={260}
          option={{
            grid: { left: 90, right: 30, top: 20, bottom: 30 },
            xAxis: { type: "value", name: "kg CO₂e/kişi", nameLocation: "end", nameTextStyle: { fontSize: 10 } },
            yAxis: { type: "category", data: sirali.map((r) => r.name.replace(" Büyükşehir Belediyesi", " BB")).reverse() },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
            series: [{
              type: "bar",
              barWidth: 18,
              data: sirali.map((r) => ({
                value: r.kisiBasiKg !== null ? Math.round(r.kisiBasiKg * 10) / 10 : 0,
                itemStyle: r.kendisi ? { color: "#16a34a" } : { color: "#86efac" },
              })).reverse(),
              label: { show: true, position: "right", fontSize: 10.5, formatter: "{c} kg" },
            }],
          }}
        />
        <p className="mt-1 text-[11px] text-ink/40">
          koyu çubuk: kurumunuz — kurumsal (belediye hizmet binaları + filo + tesisler) onaylı envanter, kent ölçeği hariç
        </p>
      </Card>

      <Card pad={false}>
        <CardTitle right={<span className="text-[11px] font-normal text-ink/40">kişi başı emisyona göre sıralı</span>}>
          <span className="px-5 pt-4">karşılaştırma tablosu</span>
        </CardTitle>
        <div className="p-2">
          <Table dense head={<>
            <th>#</th><th>belediye</th>
            <th className="text-right">net (tCO₂e)</th>
            <th className="text-right">brüt (tCO₂e)</th>
            <th className="text-right">kişi başı (kg)</th>
            <th className="text-right">onay %</th>
            <th className="text-right">belge %</th>
            <th className="text-right">mahsup (t)</th>
            <th className="text-right">net-sıfır</th>
          </>}>
            {sirali.map((r, i) => (
              <tr key={r.orgId} className={r.kendisi ? "bg-leaf-50/60" : ""}>
                <td className="text-ink/40">{i + 1}</td>
                <td className="max-w-[240px] truncate font-medium">
                  {r.name}
                  {r.kendisi && <Badge>siz</Badge>}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">{fmtTons(r.netTCO2e)}</td>
                <td className="whitespace-nowrap text-right tabular-nums text-ink/60">{fmtTons(r.brutTCO2e)}</td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {r.kisiBasiKg === null ? <span className="text-ink/30">—</span> : fmt1(r.kisiBasiKg)}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {r.onayOranPct === null ? <span className="text-ink/30">—</span> : `${fmtInt(r.onayOranPct)}%`}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {r.belgeOranPct === null ? <span className="text-ink/30">—</span> : `${fmtInt(r.belgeOranPct)}%`}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">{r.mahsupTCO2e > 0 ? fmtTons(r.mahsupTCO2e) : <span className="text-ink/30">—</span>}</td>
                <td className="whitespace-nowrap text-right text-ink/60">{r.netZeroYear}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </div>
  );
}
