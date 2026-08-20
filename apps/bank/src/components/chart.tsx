"use client";
/* ECharts sarmalayıcı — kleaf teması, ResizeObserver ile akışkan yeniden boyutlanma */
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export const KLEAF_PALETTE = ["#2563eb", "#60a5fa", "#0c2a4a", "#93c5fd", "#d97706", "#22c55e", "#a78bfa", "#f472b6"];

const KLEAF_THEME: Record<string, unknown> = {
  color: KLEAF_PALETTE,
  textStyle: { fontFamily: "var(--font-sg), ui-sans-serif", color: "#0c2a4a" },
  axisPointer: { lineStyle: { color: "#93c5fd" } },
  tooltip: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "#bfdbfe",
    textStyle: { color: "#0c2a4a", fontSize: 12 },
    extraCssText: "box-shadow:0 12px 32px -12px rgba(12,42,74,.25);border-radius:12px;backdrop-filter:blur(8px);",
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#bfdbfe" } },
    axisTick: { show: false },
    axisLabel: { color: "#0c2a4a99", fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisLabel: { color: "#0c2a4a80", fontSize: 11 },
    splitLine: { lineStyle: { color: "#dbeafe80" } },
  },
  legend: { textStyle: { color: "#0c2a4ab0", fontSize: 11 } },
};

let themeRegistered = false;

export default function Chart({ option, height = 300, onEvents, className = "" }: {
  option: echarts.EChartsOption;
  height?: number;
  className?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!themeRegistered) {
      echarts.registerTheme("kleaf", KLEAF_THEME);
      themeRegistered = true;
    }
    const chart = echarts.init(ref.current, "kleaf", { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    for (const [ev, fn] of Object.entries(onEvents)) chart.on(ev, fn);
    return () => {
      for (const [ev, fn] of Object.entries(onEvents)) chart.off(ev, fn);
    };
  }, [onEvents]);

  return <div ref={ref} className={className} style={{ height, width: "100%" }} />;
}
