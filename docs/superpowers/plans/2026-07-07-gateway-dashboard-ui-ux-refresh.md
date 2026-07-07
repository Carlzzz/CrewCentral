# Gateway Dashboard UI/UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the CrewCentral gateway dashboard so GLM and MiniMax each render as one enhanced quota/provider card containing all token pools, while the trend area becomes a single-axis throughput chart with success-rate and token side panels.

**Architecture:** Keep the existing `/metrics` contract and polling hook unchanged. Add a focused gateway UI utility module, add a new `QuotaProviderHeroCard` for GLM/MiniMax, then recompose `GatewayDashboardPage` and replace `TrendChart` internals. Old `QuotaGrid`, `PoolLoadChart`, and `TokenRateChart` files remain on disk but are no longer mounted.

**Tech Stack:** React 18, TypeScript 5.6, Vite 6, Tailwind CSS, ECharts 5.6, existing `GatewayMetrics` types from `frontend/src/lib/gateway-api.ts`.

## Global Constraints

- Only CrewCentral frontend UI files are changed; do not change CrewProxy, backend routes, permissions, or `/metrics` response schema.
- GLM and MiniMax are detected from `upstreamId`, `provider`, and `model`, case-insensitively.
- Render order is GLM first, MiniMax second, then all other providers as normal provider cards.
- GLM and MiniMax render as enhanced cards; each provider appears at most once and includes all of its `credentials`.
- The page no longer mounts the standalone `QuotaGrid`, `PoolLoadChart`, or `TokenRateChart` sections.
- Trend chart uses one y-axis for request throughput; success rate is shown in a side panel, not a second y-axis.
- Status must never be color-only: every cooling, expired, error, high-quota, and health state has text.
- Use existing light dashboard style: `bg-slate-50`, white cards, rounded-xl/2xl, slate text, sky/violet accents.
- Verification commands are `cd frontend && npx tsc -b` and `cd frontend && npx vite build`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/components/gateway/gateway-ui.ts` | Shared formatting, provider detection, provider visual themes, quota/status helpers | Create |
| `frontend/src/components/gateway/QuotaProviderHeroCard.tsx` | Enhanced GLM/MiniMax card with metrics strip and one row per token pool | Create |
| `frontend/src/components/gateway/TrendChart.tsx` | Replace dual-axis chart with throughput chart + success/token side panels | Modify |
| `frontend/src/pages/admin/GatewayDashboardPage.tsx` | Recompose page: KPI, hero cards, other provider cards, trend panel | Modify |
| `frontend/src/components/gateway/QuotaGrid.tsx` | No longer mounted | Leave unchanged |
| `frontend/src/components/gateway/PoolLoadChart.tsx` | No longer mounted | Leave unchanged |
| `frontend/src/components/gateway/TokenRateChart.tsx` | No longer mounted | Leave unchanged |

---

## Task 1: Shared Gateway UI Utilities

**Files:**
- Create: `frontend/src/components/gateway/gateway-ui.ts`

**Interfaces:**
- Consumes: `GatewayProvider`, `GatewayCredential`, `QuotaTier` from `frontend/src/lib/gateway-api.ts`.
- Produces:
  - `type ProviderTheme`
  - `formatTokens(n: number | null | undefined): string`
  - `formatCountdown(resetsAt: string | null): string | null`
  - `clampPct(n: number | null | undefined): number`
  - `getProviderKind(provider: GatewayProvider): "glm" | "minimax" | "other"`
  - `getProviderTheme(provider: GatewayProvider): ProviderTheme`
  - `splitGatewayProviders(providers: GatewayProvider[]): { heroProviders: GatewayProvider[]; otherProviders: GatewayProvider[] }`
  - `quotaTone(usedPct: number): "normal" | "warning" | "critical"`
  - `quotaFillClass(usedPct: number, theme: ProviderTheme): string`
  - `poolStatus(cred: GatewayCredential): { label: string; className: string }`
  - `poolSummary(provider: GatewayProvider): { credentialCount: number; cooldownCount: number; expiredCount: number; quotaErrorCount: number; highQuotaCount: number; criticalQuotaCount: number; maxRequestsLast1h: number; message: string }`

- [ ] **Step 1: Create the utility file**

Write this complete file to `frontend/src/components/gateway/gateway-ui.ts`:

```ts
import type { GatewayCredential, GatewayProvider } from "../../lib/gateway-api";

export type ProviderKind = "glm" | "minimax" | "other";

export type ProviderTheme = {
  kind: ProviderKind;
  displayName: string;
  accentName: string;
  accentHex: string;
  softHex: string;
  cardClass: string;
  railClass: string;
  metricClass: string;
  quotaClass: string;
  loadClass: string;
};

const GLM_THEME: ProviderTheme = {
  kind: "glm",
  displayName: "GLM",
  accentName: "sky",
  accentHex: "#0ea5e9",
  softHex: "#e0f2fe",
  cardClass: "border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-cyan-50/50",
  railClass: "from-sky-400/80 via-cyan-300/70 to-sky-200/30",
  metricClass: "border-sky-100 bg-white/75",
  quotaClass: "bg-sky-500",
  loadClass: "bg-sky-400",
};

const MINIMAX_THEME: ProviderTheme = {
  kind: "minimax",
  displayName: "MiniMax",
  accentName: "violet",
  accentHex: "#8b5cf6",
  softHex: "#ede9fe",
  cardClass: "border-violet-200/80 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/50",
  railClass: "from-violet-400/80 via-indigo-300/70 to-violet-200/30",
  metricClass: "border-violet-100 bg-white/75",
  quotaClass: "bg-violet-500",
  loadClass: "bg-violet-400",
};

const OTHER_THEME: ProviderTheme = {
  kind: "other",
  displayName: "Provider",
  accentName: "slate",
  accentHex: "#64748b",
  softHex: "#f1f5f9",
  cardClass: "border-slate-200 bg-white",
  railClass: "from-slate-300 via-slate-200 to-slate-100",
  metricClass: "border-slate-100 bg-white/75",
  quotaClass: "bg-slate-500",
  loadClass: "bg-slate-400",
};

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatCountdown(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "即将重置";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `还剩 ${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `还剩 ${h}h ${m}m`;
}

export function clampPct(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function providerKey(provider: GatewayProvider): string {
  return `${provider.upstreamId} ${provider.provider} ${provider.model}`.toLowerCase();
}

export function getProviderKind(provider: GatewayProvider): ProviderKind {
  const key = providerKey(provider);
  if (key.includes("glm") || key.includes("zai") || key.includes("bigmodel")) return "glm";
  if (key.includes("minimax")) return "minimax";
  return "other";
}

export function getProviderTheme(provider: GatewayProvider): ProviderTheme {
  const kind = getProviderKind(provider);
  if (kind === "glm") return GLM_THEME;
  if (kind === "minimax") return MINIMAX_THEME;
  return { ...OTHER_THEME, displayName: provider.provider || provider.upstreamId || "Provider" };
}

export function splitGatewayProviders(providers: GatewayProvider[]): {
  heroProviders: GatewayProvider[];
  otherProviders: GatewayProvider[];
} {
  const glm = providers.filter((p) => getProviderKind(p) === "glm");
  const minimax = providers.filter((p) => getProviderKind(p) === "minimax");
  const otherProviders = providers.filter((p) => getProviderKind(p) === "other");
  return { heroProviders: [...glm, ...minimax], otherProviders };
}

export function quotaTone(usedPct: number): "normal" | "warning" | "critical" {
  if (usedPct >= 95) return "critical";
  if (usedPct >= 80) return "warning";
  return "normal";
}

export function quotaFillClass(usedPct: number, theme: ProviderTheme): string {
  const tone = quotaTone(usedPct);
  if (tone === "critical") return "bg-rose-500";
  if (tone === "warning") return "bg-amber-500";
  return theme.quotaClass;
}

export function loadFillClass(cred: GatewayCredential, theme: ProviderTheme): string {
  if (!cred.inCooldown) return theme.loadClass;
  return cred.cooldownReason === "quota" ? "bg-rose-500" : "bg-orange-500";
}

export function poolStatus(cred: GatewayCredential): { label: string; className: string } {
  if (cred.quotaStatus === "expired") {
    return { label: "key 失效", className: "border-rose-200 bg-rose-50 text-rose-700" };
  }
  if (cred.quotaStatus === "error") {
    return { label: "查询失败", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (cred.inCooldown) {
    const label = cred.cooldownReason === "quota" ? "配额冷却" : "冷却中";
    return { label, className: "border-orange-200 bg-orange-50 text-orange-700" };
  }
  if (cred.quotaStatus === "not_configured") {
    return { label: "未配置配额", className: "border-slate-200 bg-slate-50 text-slate-500" };
  }
  return { label: "正常", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

export function poolSummary(provider: GatewayProvider): {
  credentialCount: number;
  cooldownCount: number;
  expiredCount: number;
  quotaErrorCount: number;
  highQuotaCount: number;
  criticalQuotaCount: number;
  maxRequestsLast1h: number;
  message: string;
} {
  const credentials = provider.credentials;
  const credentialCount = credentials.length;
  const cooldownCount = credentials.filter((c) => c.inCooldown).length;
  const expiredCount = credentials.filter((c) => c.quotaStatus === "expired").length;
  const quotaErrorCount = credentials.filter((c) => c.quotaStatus === "error").length;
  const highQuotaCount = credentials.filter((c) => (c.quota?.fiveHour?.usedPct ?? 0) >= 80).length;
  const criticalQuotaCount = credentials.filter((c) => (c.quota?.fiveHour?.usedPct ?? 0) >= 95).length;
  const maxRequestsLast1h = Math.max(1, ...credentials.map((c) => c.requestsLast1h ?? 0));

  let message = "所有 token 池可用，配额分布均衡";
  if (credentialCount === 0) message = "暂无 token 池数据";
  else if (provider.health === "down") message = "所有池子不可用，请检查上游凭证或配额";
  else if (quotaErrorCount > 0) message = "配额查询失败，保留最近调用负载";
  else if (cooldownCount > 0) message = "部分池子处于冷却，流量会自动绕行";
  else if (criticalQuotaCount > 0) message = "有池子接近 5h 限额，注意短时突增";
  else if (highQuotaCount > 0) message = "有池子接近 5h 限额，注意短时突增";

  return {
    credentialCount,
    cooldownCount,
    expiredCount,
    quotaErrorCount,
    highQuotaCount,
    criticalQuotaCount,
    maxRequestsLast1h,
    message,
  };
}
```

- [ ] **Step 2: Run the type checker**

Run:

```bash
cd frontend
npx tsc -b
```

Expected: TypeScript completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/gateway/gateway-ui.ts
git commit -m "feat(frontend): add gateway dashboard UI helpers"
```

---

## Task 2: GLM/MiniMax Enhanced Quota Provider Card

**Files:**
- Create: `frontend/src/components/gateway/QuotaProviderHeroCard.tsx`

**Interfaces:**
- Consumes:
  - `GatewayProvider`, `GatewayCredential` from `../../lib/gateway-api`
  - `formatTokens`, `formatCountdown`, `clampPct`, `getProviderTheme`, `poolSummary`, `poolStatus`, `quotaFillClass`, `loadFillClass` from `./gateway-ui`
- Produces:
  - default React component `QuotaProviderHeroCard({ provider }: { provider: GatewayProvider }): JSX.Element`

- [ ] **Step 1: Create the enhanced card component**

Write this complete file to `frontend/src/components/gateway/QuotaProviderHeroCard.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the type checker**

Run:

```bash
cd frontend
npx tsc -b
```

Expected: TypeScript completes with no errors. If it reports that `GatewayCredential` is used only as a type, confirm the import uses `import type` as shown above.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/gateway/QuotaProviderHeroCard.tsx
git commit -m "feat(frontend): add quota provider hero card"
```

---

## Task 3: Recompose Gateway Dashboard Page

**Files:**
- Modify: `frontend/src/pages/admin/GatewayDashboardPage.tsx`

**Interfaces:**
- Consumes:
  - `QuotaProviderHeroCard` from `../../components/gateway/QuotaProviderHeroCard`
  - `splitGatewayProviders` from `../../components/gateway/gateway-ui`
  - existing `KpiBar`, `ProviderCard`, `TrendChart`, `useGatewayMetrics`
- Produces:
  - Gateway dashboard page that renders KPI, GLM/MiniMax hero cards, other provider cards, and one trend section.
  - No imports or mounts of `PoolLoadChart`, `QuotaGrid`, or `TokenRateChart`.

- [ ] **Step 1: Replace `GatewayDashboardPage.tsx` with the recomposed page**

Replace the complete contents of `frontend/src/pages/admin/GatewayDashboardPage.tsx` with:

```tsx
import { useGatewayMetrics } from "../../hooks/useGatewayMetrics";
import KpiBar from "../../components/gateway/KpiBar";
import ProviderCard from "../../components/gateway/ProviderCard";
import QuotaProviderHeroCard from "../../components/gateway/QuotaProviderHeroCard";
import TrendChart from "../../components/gateway/TrendChart";
import { splitGatewayProviders } from "../../components/gateway/gateway-ui";

export default function GatewayDashboardPage() {
  const { data, error, lastUpdated, loading, history } = useGatewayMetrics();
  const split = data ? splitGatewayProviders(data.providers) : { heroProviders: [], otherProviders: [] };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">网关监控</h1>
            <p className="mt-1 text-sm text-slate-500">CrewProxy 实时调用 · 模型配额 · token 池状态</p>
          </div>
          <span className="text-xs text-slate-400">
            {data ? `刷新于 ${new Date(lastUpdated ?? Date.now()).toLocaleTimeString()}` : loading ? "加载中…" : ""}
          </span>
        </div>

        {data ? (
          <>
            <KpiBar totals={data.totals} activeProviders={data.activeProviders} downProviders={data.downProviders} lastUpdated={lastUpdated} error={error} />

            {split.heroProviders.length > 0 ? (
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {split.heroProviders.map((provider) => (
                  <QuotaProviderHeroCard key={provider.upstreamId} provider={provider} />
                ))}
              </section>
            ) : null}

            {split.otherProviders.length > 0 ? (
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {split.otherProviders.map((provider) => (
                  <ProviderCard key={provider.upstreamId} provider={provider} />
                ))}
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <TrendChart history={history} />
            </section>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            {error ? `加载失败：${error}` : "加载中…"}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify old dashboard sections are no longer imported**

Run:

```bash
cd frontend
npx tsc -b
```

Expected: TypeScript completes with no errors. The page should not import `PoolLoadChart`, `QuotaGrid`, or `TokenRateChart`.

- [ ] **Step 3: Build**

Run:

```bash
cd frontend
npx vite build
```

Expected: Vite production build completes successfully.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/GatewayDashboardPage.tsx
git commit -m "feat(frontend): recompose gateway dashboard around quota hero cards"
```

---

## Task 4: Replace TrendChart with Single-Axis Throughput Panel

**Files:**
- Modify: `frontend/src/components/gateway/TrendChart.tsx`

**Interfaces:**
- Consumes: `HistorySample[]` from `../../hooks/useGatewayMetrics`.
- Produces: default React component `TrendChart({ history }: { history: HistorySample[] }): JSX.Element` with:
  - ECharts throughput chart using one y-axis.
  - Success-rate side card.
  - Token/min side card.

- [ ] **Step 1: Replace `TrendChart.tsx` with the new trend panel**

Replace the complete contents of `frontend/src/components/gateway/TrendChart.tsx` with:

```tsx
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
```

- [ ] **Step 2: Run the type checker**

Run:

```bash
cd frontend
npx tsc -b
```

Expected: TypeScript completes with no errors.

- [ ] **Step 3: Build**

Run:

```bash
cd frontend
npx vite build
```

Expected: Vite production build completes successfully.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/gateway/TrendChart.tsx
git commit -m "feat(frontend): redesign gateway trend panel"
```

---

## Task 5: End-to-End UI Verification and Final Cleanup Decision

**Files:**
- Read-only verification by default.
- Modify no source files unless verification reveals a concrete defect.

**Interfaces:**
- Consumes: all changes from Tasks 1-4.
- Produces: verified frontend build and a decision that old chart files remain unused but preserved.

- [ ] **Step 1: Run final frontend verification**

Run:

```bash
cd frontend
npx tsc -b
npx vite build
```

Expected:

- `npx tsc -b` exits 0.
- `npx vite build` exits 0 and prints a production build summary.

- [ ] **Step 2: Confirm removed imports stay removed**

Run:

```bash
git grep -n "PoolLoadChart\|QuotaGrid\|TokenRateChart" -- frontend/src/pages/admin/GatewayDashboardPage.tsx frontend/src/components/gateway
```

Expected output includes references inside the old component files themselves, but `frontend/src/pages/admin/GatewayDashboardPage.tsx` does not contain `PoolLoadChart`, `QuotaGrid`, or `TokenRateChart`.

- [ ] **Step 3: Start the frontend for visual inspection**

Run:

```bash
cd frontend
npm run dev
```

Expected: Vite dev server starts and prints a local URL. Keep it running while checking the browser.

- [ ] **Step 4: Browser checklist**

Open `/admin/gateway` in the running app and verify:

1. Top KPI bar renders.
2. GLM appears as one enhanced card when GLM exists in `data.providers`.
3. MiniMax appears as one enhanced card when MiniMax exists in `data.providers`.
4. GLM and MiniMax cards are side-by-side on wide screens.
5. Each token pool row shows credential id, status badge, 5h quota bar, quota text, load bar, inFlight, and weekly quota badge when data exists.
6. Other providers still render as normal provider cards.
7. The page does not show standalone “池子负载（近 1h 调用次数）”.
8. The page does not show standalone “配额（5h / 周）”.
9. The page does not show standalone “token 速率”.
10. The trend section shows a large throughput chart and two side cards for success rate and token/min.
11. Narrow the browser width and confirm hero cards stack without horizontal overflow.

- [ ] **Step 5: Stop the dev server**

Stop the `npm run dev` process with `Ctrl+C` in the terminal that started it.

- [ ] **Step 6: Commit verification-only outcome if no fixes were needed**

If no source changes were needed during verification, make no commit. If verification required a fix, commit only the changed files with a message matching the fix, for example:

```bash
git add frontend/src/components/gateway/QuotaProviderHeroCard.tsx frontend/src/components/gateway/TrendChart.tsx frontend/src/pages/admin/GatewayDashboardPage.tsx
git commit -m "fix(frontend): polish gateway dashboard responsive layout"
```

---

## Done Definition

- `cd frontend && npx tsc -b` passes.
- `cd frontend && npx vite build` passes.
- `GatewayDashboardPage.tsx` no longer imports or renders `PoolLoadChart`, `QuotaGrid`, or `TokenRateChart`.
- GLM and MiniMax are split into hero cards by `splitGatewayProviders`.
- `QuotaProviderHeroCard` renders every credential for a hero provider in a single card.
- `TrendChart` uses one y-axis for throughput and shows success/token side panels.
- Browser verification confirms no overflow on narrow screens and no duplicate GLM/MiniMax monitor cards.

## Self-Review Notes

- Spec coverage: Tasks 1-4 cover provider detection, hero card rendering, pool quota/load rows, trend redesign, and page recomposition. Task 5 covers build and browser verification.
- Placeholder scan: This plan contains no `TBD`, `TODO`, “implement later”, or unspecified code steps.
- Type consistency: `GatewayProvider`, `GatewayCredential`, and `HistorySample` names match existing files; helper function names produced by Task 1 are consumed by Tasks 2-4 with the same signatures.
