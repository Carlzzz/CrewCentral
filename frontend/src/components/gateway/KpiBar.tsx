import type { GatewayProvider, WindowStats } from "../../lib/gateway-api";
import { activeProviderEmphasis, attentionProviderSummary, successRateEmphasis, type KpiEmphasis } from "./kpi-ui";

type KpiBarProps = {
  totals: { last1m: WindowStats; last5m: WindowStats; last1h: WindowStats };
  activeProviders?: number;
  downProviders?: number;
  lastUpdated: number | null;
  error: string | null;
  providers?: GatewayProvider[];
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function KpiTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: KpiEmphasis;
}) {
  const tone = emphasis ?? "default";
  const toneClass: Record<KpiEmphasis, { card: string; label: string; value: string; sub: string }> = {
    default: { card: "border-slate-200 bg-white", label: "text-slate-500", value: "text-slate-900", sub: "text-slate-400" },
    emerald: { card: "border-emerald-200 bg-emerald-50/60", label: "text-emerald-600", value: "text-emerald-700", sub: "text-emerald-600/70" },
    amber: { card: "border-amber-200 bg-amber-50/70", label: "text-amber-600", value: "text-amber-700", sub: "text-amber-600/75" },
    rose: { card: "border-rose-200 bg-rose-50/60", label: "text-rose-600", value: "text-rose-700", sub: "text-rose-600/75" },
  };
  const classes = toneClass[tone];
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${classes.card}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${classes.label}`}>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${classes.value}`}>
        {value}
      </div>
      {sub ? <div className={`mt-0.5 text-[11px] ${classes.sub}`}>{sub}</div> : null}
    </div>
  );
}

export default function KpiBar({ totals, activeProviders, downProviders, lastUpdated, error, providers = [] }: KpiBarProps) {
  const tokenRate = (totals.last1m.inputTokens ?? 0) + (totals.last1m.outputTokens ?? 0);
  const successRatePct = (totals.last5m.successRate ?? 0) * 100;
  const attention = providers.length > 0
    ? attentionProviderSummary(providers)
    : {
        count: downProviders ?? 0,
        downCount: downProviders ?? 0,
        degradedCount: 0,
        failedProviderCount: 0,
        emphasis: (downProviders ?? 0) > 0 ? "rose" as const : "emerald" as const,
        sub: (downProviders ?? 0) > 0 ? "存在异常，请关注" : "全部正常",
      };
  const updatedText = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—";

  return (
    <div className="space-y-3">
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50/80 px-4 py-2.5 text-sm text-rose-800 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
            <span className="font-semibold">网关离线/加载失败</span>
            <span className="text-rose-600/80">{error}</span>
          </div>
          <span className="text-[11px] text-rose-500">最近刷新：{updatedText}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="请求 / 分钟" value={String(totals.last1m.count ?? 0)} sub="最近 1 分钟" />
        <KpiTile
          label="成功率 (5min)"
          value={`${successRatePct.toFixed(1)}%`}
          sub={`${totals.last5m.success ?? 0}/${totals.last5m.count || 0}`}
          emphasis={successRateEmphasis(successRatePct)}
        />
        <KpiTile
          label="Token / 分钟"
          value={formatTokens(tokenRate)}
          sub={`入 ${formatTokens(totals.last1m.inputTokens ?? 0)} · 出 ${formatTokens(totals.last1m.outputTokens ?? 0)}`}
        />
        <KpiTile
          label="活跃 Provider"
          value={activeProviders !== undefined ? String(activeProviders) : "—"}
          sub="当前在线上游"
          emphasis={activeProviderEmphasis()}
        />
        <KpiTile
          label="需关注 Provider"
          value={String(attention.count)}
          sub={attention.sub}
          emphasis={attention.emphasis}
        />
      </div>
    </div>
  );
}
