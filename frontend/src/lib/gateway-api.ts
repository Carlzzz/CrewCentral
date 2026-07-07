import { getJson, type RcResponse } from "./api";

export type WindowStats = {
  count: number;
  success: number;
  fail: number;
  successRate: number;
  inputTokens: number;
  outputTokens: number;
  avgCostMs: number;
};

export type QuotaTier = {
  usedPct: number;
  usedTokens: number | null;
  limitTokens: number | null;
  resetsAt: string | null;
};

export type CredentialQuota = {
  fiveHour?: QuotaTier;
  weekly?: QuotaTier;
} | null;

export type GatewayCredential = {
  id: string;
  inCooldown: boolean;
  cooldownUntil: number | null;
  cooldownReason: "quota" | "rate_limit" | "network" | null;
  inFlight: number;
  requestsLast1h: number;
  quota: CredentialQuota;
  quotaStatus: "ok" | "expired" | "not_configured" | "error";
  quotaError: string | null;
};

export type ProviderHealth = "healthy" | "degraded" | "down";

export type GatewayProvider = {
  upstreamId: string;
  provider: string;
  model: string;
  health: ProviderHealth;
  stats: { last1m: WindowStats; last5m: WindowStats; last1h: WindowStats };
  credentials: GatewayCredential[];
};

export type GatewayMetrics = {
  ts: number;
  gatewayOnline: boolean;
  totals: { last1m: WindowStats; last5m: WindowStats; last1h: WindowStats };
  activeProviders?: number;
  downProviders?: number;
  providers: GatewayProvider[];
};

export async function fetchGatewayMetrics(): Promise<RcResponse<GatewayMetrics>> {
  return getJson<GatewayMetrics>("/admin/gateway/metrics");
}
