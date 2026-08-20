"use client";
/* Genel bakış grafikleri — aylık eğilim, kapsam halkası, kaynak→kapsam sankey, tesis sıralaması */
import Chart from "@/components/chart";
import { Card, CardTitle } from "@/components/ui";
import { MONTHS_TR, SCOPE_LABELS } from "@/lib/constants";
import { fmtTons } from "@/lib/format";

export interface MonthlyPoint { month: number; s1: number; s2: number; s3: number }
export interface SankeyRow { category: string; label: string; scope: number; tCO2e: number }
export interface FacilityRow { name: string; tCO2e: number }

const SCOPE_COLORS: Record<number, string> = { 1: "#0a0a0a", 2: "#334155", 3: "#cbd5e1" };

export function MonthlyTrendChart({ data, year }: { data: MonthlyPoint[]; year: number }) {
  const months = data.map((d) => MONTHS_TR[d.month - 1]);
  const mk = (key: "s1" | "s2" | "s3", scope: number) => ({
    name: SCOPE_LABELS[scope as 1 | 2 | 3].split(" — ")[0],
    type: "bar" as const,
    stack: "toplam",
    emphasis: { focus: "series" as const },
    itemStyle: { color: SCOPE_COLORS[scope], borderRadius: key === "s3" ? [5, 5, 0, 0] : 0 },
    barMaxWidth: 26,
    data: data.map((d) => Number(d[key].toFixed(2))),
  });
  return (
    <Card className="rise-1">
      <CardTitle right={<span className="text-[11px] text-ink/40">tCO₂e / ay · {year}</span>}>
        aylık emisyon eğilimi
      </CardTitle>
      <Chart
        height={290}
        option={{
          grid: { left: 48, right: 12, top: 34, bottom: 28 },
          legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8 },
          tooltip: {
            trigger: "axis",
            valueFormatter: (v) => `${fmtTons(Number(v))} tCO₂e`,
          },
          xAxis: { type: "category", data: months },
          yAxis: { type: "value" },
          series: [mk("s1", 1), mk("s2", 2), mk("s3", 3)],
        }}
      />
    </Card>
  );
}

export function ScopeDonut({ s1, s2, s3 }: { s1: number; s2: number; s3: number }) {
  const total = s1 + s2 + s3;
  return (
    <Card className="rise-2">
      <CardTitle>kapsam dağılımı</CardTitle>
      <Chart
        height={290}
        option={{
          tooltip: { trigger: "item", valueFormatter: (v) => `${fmtTons(Number(v))} tCO₂e` },
          series: [{
            type: "pie",
            radius: ["58%", "80%"],
            padAngle: 2,
            itemStyle: { borderRadius: 8 },
            label: { show: false },
            data: [
              { name: "Kapsam 1", value: Number(s1.toFixed(2)), itemStyle: { color: SCOPE_COLORS[1] } },
              { name: "Kapsam 2", value: Number(s2.toFixed(2)), itemStyle: { color: SCOPE_COLORS[2] } },
              { name: "Kapsam 3", value: Number(s3.toFixed(2)), itemStyle: { color: SCOPE_COLORS[3] } },
            ],
          }],
          graphic: [{
            type: "text", left: "center", top: "44%",
            style: { text: fmtTons(total), fontSize: 24, fontWeight: "bold", fill: "#0a0a0a", fontFamily: "var(--font-sg)" },
          }, {
            type: "text", left: "center", top: "56%",
            style: { text: "tCO₂e toplam", fontSize: 11, fill: "#0a0a0a80", fontFamily: "var(--font-sg)" },
          }],
          legend: { bottom: 0, left: "center", itemWidth: 12, itemHeight: 8 },
        }}
      />
    </Card>
  );
}

export function SourceSankey({ rows }: { rows: SankeyRow[] }) {
  const scopeNames: Record<number, string> = { 1: "Kapsam 1", 2: "Kapsam 2", 3: "Kapsam 3" };
  const positives = rows.filter((r) => r.tCO2e > 0.005);
  const nodes = [
    ...positives.map((r) => ({ name: r.label, itemStyle: { color: "#94a3b8" } })),
    ...[...new Set(positives.map((r) => r.scope))].map((s) => ({
      name: scopeNames[s], itemStyle: { color: SCOPE_COLORS[s] },
    })),
    { name: "Toplam envanter", itemStyle: { color: "#0a0a0a" } },
  ];
  const scopeSum = new Map<number, number>();
  for (const r of positives) scopeSum.set(r.scope, (scopeSum.get(r.scope) ?? 0) + r.tCO2e);
  const links = [
    ...positives.map((r) => ({ source: r.label, target: scopeNames[r.scope], value: Number(r.tCO2e.toFixed(2)) })),
    ...[...scopeSum.entries()].map(([s, v]) => ({ source: scopeNames[s], target: "Toplam envanter", value: Number(v.toFixed(2)) })),
  ];
  return (
    <Card className="rise-3">
      <CardTitle right={<span className="text-[11px] text-ink/40">kaynak → kapsam → toplam</span>}>
        emisyon akışı
      </CardTitle>
      <Chart
        height={330}
        option={{
          tooltip: { trigger: "item", valueFormatter: (v) => `${fmtTons(Number(v))} tCO₂e` },
          series: [{
            type: "sankey",
            left: 8, right: 130, top: 12, bottom: 12,
            nodeWidth: 14, nodeGap: 10,
            data: nodes,
            links,
            lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.32 },
            label: { fontSize: 11, color: "#0a0a0a", fontFamily: "var(--font-sg)" },
            emphasis: { focus: "adjacency" },
          }],
        }}
      />
    </Card>
  );
}

export function TopFacilitiesChart({ rows }: { rows: FacilityRow[] }) {
  const sorted = [...rows].sort((a, b) => a.tCO2e - b.tCO2e);
  return (
    <Card className="rise-4">
      <CardTitle right={<span className="text-[11px] text-ink/40">en yüksek 5 tesis</span>}>
        tesis bazında emisyon
      </CardTitle>
      <Chart
        height={290}
        option={{
          grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${fmtTons(Number(v))} tCO₂e` },
          xAxis: { type: "value" },
          yAxis: { type: "category", data: sorted.map((r) => r.name), axisLabel: { width: 150, overflow: "truncate" } },
          series: [{
            type: "bar",
            barMaxWidth: 20,
            data: sorted.map((r) => Number(r.tCO2e.toFixed(2))),
            itemStyle: {
              borderRadius: [0, 6, 6, 0],
              color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                { offset: 0, color: "#334155" }, { offset: 1, color: "#94a3b8" },
              ]},
            },
            label: { show: true, position: "right", fontSize: 11, color: "#0a0a0a90", formatter: (p) => fmtTons(Number(p.value)) },
          }],
        }}
      />
    </Card>
  );
}
