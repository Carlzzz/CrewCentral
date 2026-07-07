import { useEffect, useMemo, useRef } from "react";
import { echarts } from "../../lib/echarts-theme";
import type { HistorySample } from "../../hooks/useGatewayMetrics";

type TrendChartProps = {
  history: HistorySample[];
};

function formatAxisTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function TrendChart({ history }: TrendChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  const { labels, counts, rates } = useMemo(() => {
    const labels: string[] = [];
    const counts: number[] = [];
    const rates: number[] = [];
    for (const s of history) {
      labels.push(formatAxisTs(s.ts));
      counts.push(s.count ?? 0);
      rates.push(Number(((s.successRate ?? 0) * 100).toFixed(2)));
    }
    return { labels, counts, rates };
  }, [history]);

  useEffect(() => {
    if (!ref.current) return;
    if (history.length === 0) return;
    const chart = echarts.init(ref.current, "crew-light");
    chart.setOption({
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", snap: true },
      },
      legend: {
        data: ["调用数 (1h)", "成功率 (5m)"],
        top: 0,
        right: 8,
        textStyle: { fontSize: 11 },
        itemWidth: 12,
        itemHeight: 12,
      },
      xAxis: {
        type: "category",
        boundaryGap: true,
        data: labels,
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: "#e2e8f0" } },
      },
      yAxis: [
        {
          type: "value",
          name: "调用",
          nameTextStyle: { color: "#94a3b8", fontSize: 10 },
          minInterval: 1,
          splitLine: { lineStyle: { color: "#f1f5f9" } },
          axisLabel: { color: "#64748b", fontSize: 10 },
        },
        {
          type: "value",
          name: "%",
          nameTextStyle: { color: "#94a3b8", fontSize: 10 },
          min: 0,
          max: 100,
          splitLine: { show: false },
          axisLabel: { color: "#64748b", fontSize: 10, formatter: "{value}%" },
        },
      ],
      series: [
        {
          name: "调用数 (1h)",
          type: "bar",
          data: counts,
          barMaxWidth: 16,
          itemStyle: { color: "#0ea5e9", borderRadius: [2, 2, 0, 0] },
        },
        {
          name: "成功率 (5m)",
          type: "line",
          yAxisIndex: 1,
          data: rates,
          smooth: true,
          symbol: "circle",
          symbolSize: 4,
          showSymbol: false,
          lineStyle: { color: "#10b981", width: 2 },
          itemStyle: { color: "#10b981" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(16,185,129,0.18)" },
                { offset: 1, color: "rgba(16,185,129,0)" },
              ],
            },
          },
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [history, labels, counts, rates]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">调用趋势（近 6 分钟）</div>
      {history.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div ref={ref} className="h-[260px] w-full" />
      )}
    </div>
  );
}
