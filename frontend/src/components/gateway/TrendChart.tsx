import { useEffect, useMemo, useRef } from "react";
import { echarts } from "../../lib/echarts-theme";
import type { HistorySample } from "../../hooks/useGatewayMetrics";
import { formatTokens } from "./gateway-ui";

type TrendChartProps = {
  history: HistorySample[];
};

function formatAxisTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function rateTone(rate: number): { text: string; valueClass: string; barClass: string; label: string } {
  const pct = rate * 100;
  if (pct < 90) return { text: "需要检查", valueClass: "text-rose-700", barClass: "bg-rose-500", label: "失败率升高" };
  if (pct < 95) return { text: "轻微波动", valueClass: "text-amber-700", barClass: "bg-amber-500", label: "观察中" };
  return { text: "最近 5 分钟稳定", valueClass: "text-emerald-700", barClass: "bg-emerald-500", label: "稳定" };
}

function sparkPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 6) - 3;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function Sparkline({ values, className }: { values: number[]; className: string }) {
  const path = sparkPath(values, 160, 38);
  return (
    <svg viewBox="0 0 160 38" className="mt-2 h-10 w-full" aria-hidden>
      <path d={path} fill="none" className={className} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SuccessPanel({ history }: { history: HistorySample[] }) {
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const rate = latest?.successRate ?? 0;
  const pct = rate * 100;
  const tone = rateTone(rate);
  const values = history.map((s) => (s.successRate ?? 0) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">成功率</div>
          <div className={`mt-1 text-3xl font-black tracking-tight ${tone.valueClass}`}>{pct.toFixed(1)}%</div>
        </div>
        <span className="rounded-full border border-white bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 shadow-sm">{tone.label}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${tone.barClass}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <Sparkline values={values} className="stroke-emerald-500" />
      <div className="mt-1 text-xs text-slate-500">{tone.text}</div>
    </div>
  );
}

function TokenPanel({ history }: { history: HistorySample[] }) {
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const input = latest?.inputTokens ?? 0;
  const output = latest?.outputTokens ?? 0;
  const total = input + output;
  const inputPct = total > 0 ? (input / total) * 100 : 0;
  const outputPct = total > 0 ? 100 - inputPct : 0;
  const values = history.map((s) => (s.inputTokens ?? 0) + (s.outputTokens ?? 0));

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Token / min</div>
      <div className="mt-1 text-3xl font-black tracking-tight text-violet-700">{formatTokens(total)}</div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-200" aria-label={`输入 ${formatTokens(input)}，输出 ${formatTokens(output)}`}>
        <div className="h-full bg-sky-500" style={{ width: `${inputPct}%` }} />
        <div className="h-full bg-violet-500" style={{ width: `${outputPct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>输入 {formatTokens(input)}</span>
        <span>输出 {formatTokens(output)}</span>
      </div>
      <Sparkline values={values} className="stroke-violet-500" />
    </div>
  );
}

export default function TrendChart({ history }: TrendChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const { labels, counts } = useMemo(() => {
    const labels: string[] = [];
    const counts: number[] = [];
    for (const sample of history) {
      labels.push(formatAxisTs(sample.ts));
      counts.push(sample.count ?? 0);
    }
    return { labels, counts };
  }, [history]);

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

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (history.length === 0) {
      chart.clear();
      return;
    }

    chart.setOption(
      {
        grid: { left: 8, right: 16, top: 18, bottom: 10, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line", snap: true },
          formatter: (params: unknown) => {
            const arr = params as Array<{ dataIndex: number; marker: string; value: number }>;
            if (!arr || arr.length === 0) return "";
            const index = arr[0].dataIndex;
            const sample = history[index];
            if (!sample) return "";
            return [
              `<div style="font-weight:700;margin-bottom:4px">${formatAxisTs(sample.ts)}</div>`,
              `调用数：<b>${sample.count ?? 0}</b>`,
              `成功率：<b>${((sample.successRate ?? 0) * 100).toFixed(1)}%</b>`,
              `输入：<b>${formatTokens(sample.inputTokens)}</b>`,
              `输出：<b>${formatTokens(sample.outputTokens)}</b>`,
            ].join("<br/>");
          },
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: labels,
          axisLabel: { color: "#64748b", fontSize: 10, hideOverlap: true },
          axisLine: { lineStyle: { color: "#e2e8f0" } },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          name: "调用",
          minInterval: 1,
          nameTextStyle: { color: "#94a3b8", fontSize: 10 },
          splitLine: { lineStyle: { color: "#f1f5f9" } },
          axisLabel: { color: "#64748b", fontSize: 10 },
        },
        series: [
          {
            name: "调用节奏",
            type: "bar",
            data: counts,
            barMaxWidth: 14,
            itemStyle: { color: "rgba(14,165,233,0.18)", borderRadius: [4, 4, 0, 0] },
            tooltip: { show: false },
          },
          {
            name: "调用趋势",
            type: "line",
            data: counts,
            smooth: true,
            showSymbol: false,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { color: "#0ea5e9", width: 2.5 },
            itemStyle: { color: "#0ea5e9" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(14,165,233,0.22)" },
                  { offset: 1, color: "rgba(14,165,233,0.02)" },
                ],
              },
            },
          },
        ],
      },
      false,
    );
  }, [history, labels, counts]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-800">调用趋势</div>
          <div className="mt-0.5 text-xs text-slate-500">主图显示调用吞吐；成功率和 token 速率独立展示，避免双轴混读</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">近 6 分钟</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[300px] rounded-2xl border border-slate-200 bg-white p-3">
          <div ref={ref} className="h-[284px] w-full" />
          {history.length === 0 ? (
            <div className="absolute inset-3 flex items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
              暂无数据
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <SuccessPanel history={history} />
          <TokenPanel history={history} />
        </div>
      </div>
    </div>
  );
}
