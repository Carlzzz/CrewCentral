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
