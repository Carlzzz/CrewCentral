import { useEffect, useMemo, useRef } from "react";
import { echarts } from "../../lib/echarts-theme";
import type { HistorySample } from "../../hooks/useGatewayMetrics";

type TokenRateChartProps = {
  history: HistorySample[];
};

const COLOR_INPUT = "#0ea5e9"; // sky (palette[0])
const COLOR_OUTPUT = "#8b5cf6"; // violet (palette[1])

function formatAxisTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TokenRateChart({ history }: TokenRateChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const { labels, inputs, outputs } = useMemo(() => {
    const labels: string[] = [];
    const inputs: number[] = [];
    const outputs: number[] = [];
    for (const s of history) {
      labels.push(formatAxisTs(s.ts));
      inputs.push(s.inputTokens ?? 0);
      outputs.push(s.outputTokens ?? 0);
    }
    return { labels, inputs, outputs };
  }, [history]);

  // Mount-once: create the chart a single time and attach the resize listener.
  // Disposing happens only on unmount, so polling (which yields a new history
  // ref every 3s) no longer rebuilds the canvas.
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, "crew-light");
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Data effect: just push a new option into the existing chart instance.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (history.length === 0) {
      chart.clear();
      return;
    }
    chart.setOption(
      {
        grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line", snap: true },
          valueFormatter: (v: unknown) => formatTokens(Number(v ?? 0)),
        },
        legend: {
          data: ["输入", "输出"],
          top: 0,
          right: 8,
          textStyle: { fontSize: 11 },
          itemWidth: 12,
          itemHeight: 12,
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: labels,
          axisLabel: {
            color: "#64748b",
            fontSize: 10,
            hideOverlap: true,
          },
          axisLine: { lineStyle: { color: "#e2e8f0" } },
        },
        yAxis: {
          type: "value",
          name: "tok/min",
          nameTextStyle: { color: "#94a3b8", fontSize: 10 },
          splitLine: { lineStyle: { color: "#f1f5f9" } },
          axisLabel: {
            color: "#64748b",
            fontSize: 10,
            formatter: (v: number) => formatTokens(v),
          },
        },
        series: [
          {
            name: "输入",
            type: "line",
            stack: "tokens",
            data: inputs,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.5, color: COLOR_INPUT },
            itemStyle: { color: COLOR_INPUT },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(14,165,233,0.35)" },
                  { offset: 1, color: "rgba(14,165,233,0.04)" },
                ],
              },
            },
          },
          {
            name: "输出",
            type: "line",
            stack: "tokens",
            data: outputs,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.5, color: COLOR_OUTPUT },
            itemStyle: { color: COLOR_OUTPUT },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(139,92,246,0.35)" },
                  { offset: 1, color: "rgba(139,92,246,0.04)" },
                ],
              },
            },
          },
        ],
      },
      false,
    );
  }, [history, labels, inputs, outputs]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">token 速率</div>
      <div className="relative">
        <div ref={ref} className="h-[260px] w-full" />
        {history.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}
