import assert from "node:assert/strict";
import {
  sharedQuotaLabel,
  poolRequestMetricLabel,
  poolRequestMetricText,
  getProviderKind,
  getProviderTheme,
  splitGatewayProviders,
  formatBalance,
} from "./gateway-ui.ts";

const glmProvider = {
  upstreamId: "glm",
  provider: "glm",
  model: "glm-5.2",
  health: "healthy",
  stats: {
    last1m: { count: 0, success: 0, fail: 0, successRate: 0, inputTokens: 0, outputTokens: 0, avgCostMs: 0 },
    last5m: { count: 0, success: 0, fail: 0, successRate: 0, inputTokens: 0, outputTokens: 0, avgCostMs: 0 },
    last1h: { count: 0, success: 0, fail: 0, successRate: 0, inputTokens: 0, outputTokens: 0, avgCostMs: 0 },
  },
  credentials: [
    {
      id: "a",
      inCooldown: false,
      cooldownUntil: null,
      cooldownReason: null,
      inFlight: 0,
      requestsLast1h: 3,
      quotaStatus: "ok",
      quotaError: null,
      quota: { fiveHour: { usedPct: 42.5, usedTokens: 68000000, limitTokens: 160000000, resetsAt: "2026-07-08T10:00:00Z" } },
    },
    {
      id: "b",
      inCooldown: false,
      cooldownUntil: null,
      cooldownReason: null,
      inFlight: 0,
      requestsLast1h: 5,
      quotaStatus: "ok",
      quotaError: null,
      quota: { fiveHour: { usedPct: 42.5, usedTokens: 68000000, limitTokens: 160000000, resetsAt: "2026-07-08T10:00:00Z" } },
    },
  ],
};

const minimaxProvider = { ...glmProvider, upstreamId: "minimax", provider: "minimax", model: "minimax" };

assert.equal(poolRequestMetricLabel(), "近 1h 请求");
assert.equal(poolRequestMetricText(7), "近 1h 请求 7 次");
assert.equal(sharedQuotaLabel(glmProvider), "共享配额");
assert.equal(sharedQuotaLabel(minimaxProvider), null);
assert.equal(sharedQuotaLabel({ ...glmProvider, credentials: [glmProvider.credentials[0]] }), null);

// ── Volcengine (火山方舟) provider kind / theme / hero split ──
const volcProvider = {
  ...glmProvider,
  upstreamId: "ark",
  provider: "volcengine",
  model: "doubao-seed-2.0-pro",
  credentials: [
    {
      id: "account",
      inCooldown: false,
      cooldownUntil: null,
      cooldownReason: null,
      inFlight: 0,
      requestsLast1h: 0,
      quotaStatus: "ok",
      quotaError: null,
      quota: {
        fiveHour: { usedPct: 0, usedTokens: null, limitTokens: null, resetsAt: null },
        weekly: { usedPct: 6.5, usedTokens: null, limitTokens: null, resetsAt: "2026-07-12T16:00:00Z" },
        monthly: { usedPct: 63.2, usedTokens: null, limitTokens: null, resetsAt: "2026-07-15T15:59:59Z" },
      },
    },
  ],
};

assert.equal(getProviderKind(volcProvider), "volcengine");
assert.equal(getProviderTheme(volcProvider).displayName, "火山方舟");
// ark upstreamId alone (provider/model empty) still detects as volcengine
assert.equal(getProviderKind({ ...volcProvider, provider: "", model: "" }), "volcengine");

const split = splitGatewayProviders([glmProvider, minimaxProvider, volcProvider]);
assert.equal(split.heroProviders.length, 3, "glm + minimax + volcengine are all hero providers");
assert.equal(split.otherProviders.length, 0);
assert.ok(split.heroProviders.some((p) => getProviderKind(p) === "volcengine"));

// ── formatBalance (DeepSeek pay-as-you-go) ──
assert.equal(formatBalance(3565.57, "CNY"), "¥3,565.57");
assert.equal(formatBalance(12.5, "USD"), "$12.50");
assert.equal(formatBalance(0, "CNY"), "¥0.00");
assert.equal(formatBalance(null, "CNY"), "—");
assert.equal(formatBalance(88.5, "XYZ"), "88.50 XYZ");
// DeepSeek upstream stays an "other" provider (renders via ProviderCard, not a hero)
assert.equal(getProviderKind({ ...glmProvider, upstreamId: "deepseek", provider: "deepseek", model: "deepseek-v4" }), "other");

console.log("gateway-ui behavior tests passed");
