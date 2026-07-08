import assert from "node:assert/strict";
import {
  sharedQuotaLabel,
  poolRequestMetricLabel,
  poolRequestMetricText,
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

console.log("gateway-ui behavior tests passed");
