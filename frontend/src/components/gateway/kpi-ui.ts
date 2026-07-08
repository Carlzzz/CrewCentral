import type { GatewayProvider } from "../../lib/gateway-api";

export type KpiEmphasis = "default" | "emerald" | "amber" | "rose";

export function successRateEmphasis(successRatePct: number): KpiEmphasis {
  if (successRatePct >= 95) return "emerald";
  if (successRatePct >= 80) return "amber";
  return "rose";
}

export function activeProviderEmphasis(): KpiEmphasis {
  return "emerald";
}

export function downProviderEmphasis(downProviders: number): KpiEmphasis {
  return downProviders > 0 ? "rose" : "emerald";
}

export function attentionProviderSummary(providers: GatewayProvider[]): {
  count: number;
  downCount: number;
  degradedCount: number;
  failedProviderCount: number;
  emphasis: KpiEmphasis;
  sub: string;
} {
  const downCount = providers.filter((provider) => provider.health === "down").length;
  const degradedCount = providers.filter((provider) => provider.health === "degraded").length;
  const failedProviderCount = providers.filter((provider) => (provider.stats.last5m.fail ?? 0) > 0).length;
  const attentionIds = new Set<string>();
  for (const provider of providers) {
    if (provider.health !== "healthy" || (provider.stats.last5m.fail ?? 0) > 0) {
      attentionIds.add(provider.upstreamId);
    }
  }

  const parts: string[] = [];
  if (downCount > 0) parts.push(`${downCount} 个异常`);
  if (degradedCount > 0) parts.push(`${degradedCount} 个降级`);
  if (failedProviderCount > 0) parts.push(`${failedProviderCount} 个有失败`);

  return {
    count: attentionIds.size,
    downCount,
    degradedCount,
    failedProviderCount,
    emphasis: downCount > 0 ? "rose" : attentionIds.size > 0 ? "amber" : "emerald",
    sub: parts.length > 0 ? parts.join(" · ") : "全部正常",
  };
}

export function providerSuccessRateSummary(provider: GatewayProvider): {
  label: string;
  value: string;
  sub: string;
  valueClass: string;
} {
  const sr1h = (provider.stats.last1h.successRate ?? 0) * 100;
  const sr5m = (provider.stats.last5m.successRate ?? 0) * 100;
  return {
    label: "成功率 (1h)",
    value: `${sr1h.toFixed(1)}%`,
    sub: `5min ${sr5m.toFixed(1)}% · ${provider.stats.last1h.success ?? 0}/${provider.stats.last1h.count || 0}`,
    valueClass: sr1h < 80 ? "text-rose-600" : sr1h < 95 ? "text-amber-600" : "text-slate-900",
  };
}
