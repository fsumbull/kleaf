"use client";
import Chart from "@/components/chart";
import { fmtTons } from "@/lib/format";

export default function BranchFootprintChart({ rows, height = 260 }: {
  rows: { name: string; tCO2e: number }[];
  height?: number;
}) {
  return (
    <Chart
      height={height}
      option={{
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${fmtTons(Number(v))} tCO₂e` },
        grid: { left: 10, right: 40, top: 10, bottom: 10, containLabel: true },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: rows.map((r) => r.name) },
        series: [{
          type: "bar", barMaxWidth: 22,
          data: rows.map((r) => Number(r.tCO2e.toFixed(2))),
          itemStyle: { borderRadius: [0, 6, 6, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [
            { offset: 0, color: "#16a34a" }, { offset: 1, color: "#4ade80" },
          ] } },
          label: { show: true, position: "right", fontSize: 11, color: "#0c4a3390", formatter: (p) => fmtTons(Number(p.value)) },
        }],
      }}
    />
  );
}
