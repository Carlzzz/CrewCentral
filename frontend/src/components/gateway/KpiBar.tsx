import type { WindowStats } from "../../lib/gateway-api";

type KpiBarProps = {
  totals: { last1m: WindowStats; last5m: WindowStats; last1h: WindowStats };
  activeProviders?: number;
  downProviders?: number;
  lastUpdated: number | null;
  error: string | null;
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
  emphasis?: "rose" | "default";
}) {
  const isRose = emphasis === "rose";
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        isRose ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${isRose ? "text-rose-600" : "text-slate-500"}`}>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${isRose ? "text-rose-700" : "text-slate-900"}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

export default function KpiBar({ totals, activeProviders, downProviders, lastUpdated, error }: KpiBarProps) {
  const tokenRate = (totals.last1m.inputTokens ?? 0) + (totals.last1m.outputTokens ?? 0);
  const successRatePct = (totals.last5m.successRate ?? 0) * 100;
  const down = downProviders ?? 0;
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
          emphasis={successRatePct < 90 ? "rose" : "default"}
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
        />
        <KpiTile
          label="异常 Provider"
          value={String(down)}
          sub={down > 0 ? "存在异常，请关注" : "全部正常"}
          emphasis={down > 0 ? "rose" : "default"}
        />
      </div>
    </div>
  );
}
