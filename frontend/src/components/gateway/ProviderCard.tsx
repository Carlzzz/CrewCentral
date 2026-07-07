import type { GatewayProvider, ProviderHealth } from "../../lib/gateway-api";

type ProviderCardProps = {
  provider: GatewayProvider;
};

const HEALTH_DOT: Record<ProviderHealth, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-rose-500",
};

const HEALTH_CARD: Record<ProviderHealth, string> = {
  healthy: "border-slate-200 bg-white",
  degraded: "border-amber-300 bg-amber-50/40",
  down: "border-rose-300 bg-rose-50/50",
};

const HEALTH_LABEL: Record<ProviderHealth, string> = {
  healthy: "健康",
  degraded: "降级",
  down: "异常",
};

function quotaColor(usedPct: number): string {
  if (usedPct > 95) return "bg-rose-500";
  if (usedPct > 80) return "bg-amber-500";
  return "bg-sky-500";
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white/70 px-2.5 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-sm font-bold text-slate-900 ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

export default function ProviderCard({ provider }: ProviderCardProps) {
  const { provider: name, model, health, stats, credentials } = provider;
  const cardClass = HEALTH_CARD[health];
  const dotClass = HEALTH_DOT[health];
  const isDown = health === "down";

  const sr5 = (stats.last5m.successRate ?? 0) * 100;
  const srLow = sr5 < 90;

  // mini quota bar: first ok credential with a fiveHour tier
  const quotaCred = credentials.find((c) => c.quotaStatus === "ok" && c.quota?.fiveHour);
  const usedPct = quotaCred?.quota?.fiveHour?.usedPct ?? null;
  const resetsAt = quotaCred?.quota?.fiveHour?.resetsAt ?? null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border shadow-sm ${cardClass}`}
    >
      {isDown ? <span className="absolute inset-y-0 left-0 w-1 bg-rose-500" aria-hidden /> : null}
      <div className={`space-y-3 p-4 ${isDown ? "pl-5" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
              <span className="truncate text-base font-bold text-slate-900">{name}</span>
            </div>
            <div className="mt-0.5 pl-[18px] text-[11px] font-mono text-slate-500 truncate">{model}</div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              health === "healthy"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                : health === "degraded"
                ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                : "bg-rose-50 text-rose-700 border border-rose-200/60"
            }`}
          >
            {HEALTH_LABEL[health]}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="成功率 (5min)"
            value={`${sr5.toFixed(1)}%`}
            valueClass={srLow ? "text-amber-600" : "text-slate-900"}
          />
          <Stat label="调用 (5min)" value={String(stats.last5m.count ?? 0)} />
          <Stat label="均耗时" value={`${Math.round(stats.last5m.avgCostMs ?? 0)}ms`} />
        </div>

        {usedPct !== null ? (
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold uppercase tracking-wider">配额 (5h)</span>
              <span className="font-mono text-slate-600">{usedPct.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
              <div
                className={`h-full rounded-full ${quotaColor(usedPct)}`}
                style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
              />
            </div>
            {resetsAt ? (
              <div className="mt-0.5 text-[10px] text-slate-400">重置于 {new Date(resetsAt).toLocaleString()}</div>
            ) : null}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">暂无可用配额数据</div>
        )}
      </div>
    </div>
  );
}
