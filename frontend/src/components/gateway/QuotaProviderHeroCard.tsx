import type { GatewayCredential, GatewayProvider } from "../../lib/gateway-api";
import {
  clampPct,
  formatCountdown,
  formatTokens,
  getProviderTheme,
  loadFillClass,
  poolStatus,
  poolSummary,
  quotaFillClass,
  type ProviderTheme,
} from "./gateway-ui";

type QuotaProviderHeroCardProps = {
  provider: GatewayProvider;
};

const HEALTH_LABEL: Record<GatewayProvider["health"], string> = {
  healthy: "健康",
  degraded: "降级",
  down: "异常",
};

const HEALTH_PILL: Record<GatewayProvider["health"], string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  degraded: "border-amber-200 bg-amber-50 text-amber-700",
  down: "border-rose-200 bg-rose-50 text-rose-700",
};

function MetricTile({ label, value, sub, theme }: { label: string; value: string; sub?: string; theme: ProviderTheme }) {
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${theme.metricClass}`}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-base font-extrabold tracking-tight text-slate-900">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function SignalRail({ theme }: { theme: ProviderTheme }) {
  return (
    <div className="pointer-events-none absolute inset-x-4 top-0 h-1 overflow-hidden rounded-b-full bg-slate-100/80">
      <div className={`h-full w-2/3 rounded-full bg-gradient-to-r ${theme.railClass}`} />
    </div>
  );
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}

function QuotaText({ cred }: { cred: GatewayCredential }) {
  const fiveHour = cred.quota?.fiveHour;
  if (cred.quotaStatus === "expired") return <span className="text-rose-600">key 失效</span>;
  if (cred.quotaStatus === "error") return <span className="text-amber-600">查询失败{cred.quotaError ? `：${cred.quotaError}` : ""}</span>;
  if (!fiveHour) return <span className="text-slate-400">暂无 5h 配额数据</span>;

  const countdown = formatCountdown(fiveHour.resetsAt ?? null);
  const usageText = fiveHour.limitTokens == null
    ? `已用 ${fiveHour.usedPct.toFixed(1)}%`
    : `已用 ${formatTokens(fiveHour.usedTokens)} / ${formatTokens(fiveHour.limitTokens)}`;
  return (
    <span>
      {usageText}（{fiveHour.usedPct.toFixed(1)}%）{countdown ? ` · ${countdown}` : " · 滚动窗口"}
    </span>
  );
}

function PoolRow({ cred, maxRequestsLast1h, theme }: { cred: GatewayCredential; maxRequestsLast1h: number; theme: ProviderTheme }) {
  const status = poolStatus(cred);
  const fiveHour = cred.quota?.fiveHour;
  const usedPct = clampPct(fiveHour?.usedPct ?? 0);
  const loadPct = clampPct(((cred.requestsLast1h ?? 0) / Math.max(1, maxRequestsLast1h)) * 100);
  const weeklyPct = cred.quota?.weekly?.usedPct;

  return (
    <div className="rounded-xl border border-white/80 bg-white/70 p-3 shadow-sm ring-1 ring-slate-200/60">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 lg:w-[34%]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-mono text-xs font-semibold text-slate-700">{cred.id}</span>
            <StatusBadge label={status.label} className={status.className} />
            {cred.quota?.estimated === true ? <StatusBadge label="预估" className="border-slate-200 bg-slate-50 text-slate-500" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>inFlight {cred.inFlight ?? 0}</span>
            <span>近 1h {cred.requestsLast1h ?? 0} 次</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span className="font-semibold uppercase tracking-wider">5h 配额</span>
            {fiveHour ? <span className="font-mono font-semibold text-slate-700">{usedPct.toFixed(1)}%</span> : <span>—</span>}
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div className={`h-full rounded-full ${quotaFillClass(usedPct, theme)}`} style={{ width: `${usedPct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            <QuotaText cred={cred} />
          </div>
        </div>

        <div className="lg:w-[120px]">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>负载</span>
            <span className="font-mono text-slate-600">{cred.requestsLast1h ?? 0}</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div className={`h-full rounded-full ${loadFillClass(cred, theme)}`} style={{ width: `${loadPct}%` }} />
          </div>
          <div className="mt-1 flex justify-end">
            {weeklyPct != null ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">周 {weeklyPct.toFixed(1)}%</span>
            ) : (
              <span className="text-[10px] text-slate-400">周 —</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuotaProviderHeroCard({ provider }: QuotaProviderHeroCardProps) {
  const theme = getProviderTheme(provider);
  const summary = poolSummary(provider);
  const stats5m = provider.stats.last5m;
  const stats1m = provider.stats.last1m;
  const successRatePct = (stats5m.successRate ?? 0) * 100;
  const tokenRate = (stats1m.inputTokens ?? 0) + (stats1m.outputTokens ?? 0);

  return (
    <article className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${theme.cardClass}`}>
      <SignalRail theme={theme} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black tracking-tight text-slate-950">{theme.displayName}</h2>
            <StatusBadge label={HEALTH_LABEL[provider.health]} className={HEALTH_PILL[provider.health]} />
            {summary.cooldownCount > 0 ? <StatusBadge label={`${summary.cooldownCount} 个池子冷却`} className="border-orange-200 bg-orange-50 text-orange-700" /> : null}
            {summary.highQuotaCount > 0 ? <StatusBadge label={`${summary.highQuotaCount} 个池子 >80%`} className="border-amber-200 bg-amber-50 text-amber-700" /> : null}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-500">{provider.model}</div>
        </div>
        <div className="shrink-0 rounded-full border border-white/80 bg-white/65 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          {summary.credentialCount} 个 token 池
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <MetricTile label="成功率 5min" value={`${successRatePct.toFixed(1)}%`} sub={`${stats5m.success ?? 0}/${stats5m.count || 0}`} theme={theme} />
        <MetricTile label="调用 5min" value={String(stats5m.count ?? 0)} sub={`失败 ${stats5m.fail ?? 0}`} theme={theme} />
        <MetricTile label="平均耗时" value={`${Math.round(stats5m.avgCostMs ?? 0)}ms`} sub="最近 5 分钟" theme={theme} />
        <MetricTile label="Token / min" value={formatTokens(tokenRate)} sub={`入 ${formatTokens(stats1m.inputTokens)} · 出 ${formatTokens(stats1m.outputTokens)}`} theme={theme} />
      </div>

      <div className="mt-4 space-y-2.5">
        {provider.credentials.length === 0 ? (
          <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 text-sm text-slate-400">
            暂无 token 池数据
          </div>
        ) : (
          provider.credentials.map((cred) => (
            <PoolRow key={cred.id} cred={cred} maxRequestsLast1h={summary.maxRequestsLast1h} theme={theme} />
          ))
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
        {summary.message}
      </div>
    </article>
  );
}
