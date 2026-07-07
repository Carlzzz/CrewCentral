import { useEffect, useMemo, useRef } from "react";
import { echarts } from "../../lib/echarts-theme";
import type { GatewayProvider, GatewayCredential } from "../../lib/gateway-api";

type PoolLoadChartProps = {
  providers: GatewayProvider[];
};

const THEME_PALETTE = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e", "#4f46e5", "#f97316"];
const COOLDOWN_COLOR_QUOTA = "#f43f5e"; // rose
const COOLDOWN_COLOR_OTHER = "#f97316"; // orange

function formatRemaining(cooldownUntil: number | null, now: number): string | null {
  if (cooldownUntil == null) return null;
  const ms = cooldownUntil - now;
  if (ms <= 0) return "即将解封";
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `还剩 ${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `还剩 ${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `还剩 ${h}h ${m}m`;
}

const COOLDOWN_REASON_LABEL: Record<NonNullable<GatewayCredential["cooldownReason"]>, string> = {
  quota: "配额",
  rate_limit: "限流",
  network: "网络",
};

type BarDatum = {
  label: string;
  value: number;
  color: string;
  provider: string;
  credentialId: string;
  inCooldown: boolean;
  cooldownReason: GatewayCredential["cooldownReason"];
  remaining: string | null;
};

export default function PoolLoadChart({ providers }: PoolLoadChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const data = useMemo<BarDatum[]>(() => {
    const now = Date.now();
    const rows: BarDatum[] = [];
    providers.forEach((p, pIdx) => {
      const themeColor = THEME_PALETTE[pIdx % THEME_PALETTE.length];
      p.credentials.forEach((c) => {
        let color = themeColor;
        let remaining: string | null = null;
        if (c.inCooldown) {
          color = c.cooldownReason === "quota" ? COOLDOWN_COLOR_QUOTA : COOLDOWN_COLOR_OTHER;
          remaining = formatRemaining(c.cooldownUntil, now);
        }
        rows.push({
          label: `${p.provider}/${c.id}`,
          value: c.requestsLast1h ?? 0,
          color,
          provider: p.provider,
          credentialId: c.id,
          inCooldown: c.inCooldown,
          cooldownReason: c.cooldownReason,
          remaining,
        });
      });
    });
    // Sort grouped by provider (keep input order), but push largest values up
    // visually by keeping stable order — consumers can scan by group.
    return rows;
  }, [providers]);

  // Mount-once: create the chart a single time and attach the resize listener.
  // Disposing happens only on unmount, so polling (which yields a new data ref
  // every 3s) no longer rebuilds the canvas.
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
    if (data.length === 0) {
      chart.clear();
      return;
    }
    const labels = data.map((d) => d.label);
    const values = data.map((d) => ({
      value: d.value,
      itemStyle: { color: d.color, borderRadius: [0, 3, 3, 0] },
    }));
    chart.setOption(
      {
        grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: unknown) => {
            const arr = params as Array<{ dataIndex: number }>;
            if (!arr || arr.length === 0) return "";
            const d = data[arr[0].dataIndex];
            const lines = [
              `<div style="font-weight:600;margin-bottom:2px">${d.label}</div>`,
              `近 1h 调用：<b>${d.value}</b>`,
            ];
            if (d.inCooldown) {
              const reason = d.cooldownReason ? COOLDOWN_REASON_LABEL[d.cooldownReason] : "—";
              lines.push(`冷却中（${reason}）${d.remaining ? ` · ${d.remaining}` : ""}`);
            } else {
              lines.push(`<span style="color:#10b981">正常</span>`);
            }
            return lines.join("<br/>");
          },
        },
        xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#f1f5f9" } } },
        yAxis: {
          type: "category",
          data: labels,
          inverse: true,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#e2e8f0" } },
        },
        series: [
          {
            type: "bar",
            data: values,
            barMaxWidth: 18,
            label: {
              show: true,
              position: "right",
              color: "#475569",
              fontSize: 11,
              formatter: (p: { value: number }) => String(p.value),
            },
          },
        ],
      },
      false,
    );
  }, [data]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">池子负载（近 1h 调用次数）</div>
      <div className="relative">
        <div ref={ref} className="h-[280px] w-full" />
        {data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}
