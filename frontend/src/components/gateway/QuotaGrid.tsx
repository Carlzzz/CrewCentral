import { useMemo } from "react";
import type { GatewayProvider, GatewayCredential, QuotaTier } from "../../lib/gateway-api";

type QuotaGridProps = {
  providers: GatewayProvider[];
};

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCountdown(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return "即将重置";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `还剩 ${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `还剩 ${h}h ${m}m`;
}

function quotaBarClass(usedPct: number): string {
  if (usedPct > 95) return "bg-rose-500";
  if (usedPct > 80) return "bg-amber-500";
  return "bg-sky-500";
}

function quotaTextClass(usedPct: number): string {
  if (usedPct > 95) return "text-rose-600";
  if (usedPct > 80) return "text-amber-600";
  return "text-sky-600";
}

type Row = {
  key: string;
  label: string;
  cred: GatewayCredential;
};

export default function QuotaGrid({ providers }: QuotaGridProps) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of providers) {
      for (const c of p.credentials) {
        if (c.quotaStatus === "not_configured") continue;
        out.push({ key: `${p.upstreamId}:${c.id}`, label: `${p.provider}/${c.id}`, cred: c });
      }
    }
    return out;
  }, [providers]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">配额（5h / 周）</div>
      {rows.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <QuotaCard key={r.key} label={r.label} cred={r.cred} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuotaCard({ label, cred }: { label: string; cred: GatewayCredential }) {
  if (cred.quotaStatus === "expired") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
        <div className="truncate text-xs font-mono text-slate-600">{label}</div>
        <div className="mt-1 text-sm font-semibold text-rose-700">key 失效</div>
      </div>
    );
  }
  if (cred.quotaStatus === "error") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <div className="truncate text-xs font-mono text-slate-600">{label}</div>
        <div className="mt-1 text-sm font-semibold text-amber-700">查询失败{cred.quotaError ? `（${cred.quotaError}）` : ""}</div>
      </div>
    );
  }

  // ok
  const fiveHour: QuotaTier | undefined = cred.quota?.fiveHour;
  if (!fiveHour) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="truncate text-xs font-mono text-slate-600">{label}</div>
        <div className="mt-1 text-sm text-slate-400">暂无配额数据</div>
      </div>
    );
  }

  const usedPct = fiveHour.usedPct ?? 0;
  const countdown = formatCountdown(fiveHour.resetsAt ?? null);
  const weeklyPct = cred.quota?.weekly?.usedPct;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center text-xs font-mono text-slate-600">
        <span className="truncate">{label}</span>
        {cred.quota?.estimated === true && (
          <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">预估</span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
        <div
          className={`h-full rounded-full ${quotaBarClass(usedPct)}`}
          style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
        />
      </div>
      <div className={`mt-1.5 text-xs font-semibold ${quotaTextClass(usedPct)}`}>
        已用 {formatTokens(fiveHour.usedTokens)} / {formatTokens(fiveHour.limitTokens)}（{usedPct.toFixed(1)}%）
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-400">
        {fiveHour.resetsAt == null ? (
          <span className="text-[10px] text-slate-400">滚动窗口</span>
        ) : (
          <span className="text-[10px] text-slate-400">重置 {countdown}</span>
        )}
        {weeklyPct != null ? <span className="font-mono">周：{weeklyPct.toFixed(1)}%</span> : null}
      </div>
    </div>
  );
}
