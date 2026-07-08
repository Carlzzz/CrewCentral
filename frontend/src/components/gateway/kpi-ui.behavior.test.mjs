import assert from "node:assert/strict";
import {
  activeProviderEmphasis,
  attentionProviderSummary,
  downProviderEmphasis,
  providerSuccessRateSummary,
  successRateEmphasis,
} from "./kpi-ui.ts";

const windowStats = (count, success, fail, successRate = count > 0 ? success / count : 0) => ({
  count,
  success,
  fail,
  successRate,
  inputTokens: 0,
  outputTokens: 0,
  avgCostMs: 0,
});

const provider = (health, last5m, last1h) => ({
  upstreamId: health,
  provider: health,
  model: "model",
  health,
  stats: {
    last1m: windowStats(0, 0, 0),
    last5m,
    last1h,
  },
  credentials: [],
});

assert.equal(successRateEmphasis(100), "emerald");
assert.equal(successRateEmphasis(95), "emerald");
assert.equal(successRateEmphasis(94.9), "amber");
assert.equal(successRateEmphasis(80), "amber");
assert.equal(successRateEmphasis(79.9), "rose");

assert.equal(activeProviderEmphasis(), "emerald");
assert.equal(downProviderEmphasis(0), "emerald");
assert.equal(downProviderEmphasis(2), "rose");

assert.deepEqual(
  attentionProviderSummary([
    provider("healthy", windowStats(5, 4, 1), windowStats(100, 99, 1)),
    provider("degraded", windowStats(5, 5, 0), windowStats(100, 100, 0)),
    provider("down", windowStats(0, 0, 0), windowStats(0, 0, 0)),
  ]),
  { count: 3, downCount: 1, degradedCount: 1, failedProviderCount: 1, emphasis: "rose", sub: "1 个异常 · 1 个降级 · 1 个有失败" },
);

assert.deepEqual(
  attentionProviderSummary([
    provider("healthy", windowStats(5, 4, 1), windowStats(100, 99, 1)),
  ]),
  { count: 1, downCount: 0, degradedCount: 0, failedProviderCount: 1, emphasis: "amber", sub: "1 个有失败" },
);

assert.deepEqual(attentionProviderSummary([provider("healthy", windowStats(5, 5, 0), windowStats(100, 100, 0))]), {
  count: 0,
  downCount: 0,
  degradedCount: 0,
  failedProviderCount: 0,
  emphasis: "emerald",
  sub: "全部正常",
});

assert.deepEqual(providerSuccessRateSummary(provider("healthy", windowStats(5, 4, 1), windowStats(100, 97, 3))), {
  label: "成功率 (1h)",
  value: "97.0%",
  sub: "5min 80.0% · 97/100",
  valueClass: "text-slate-900",
});

console.log("kpi-ui behavior tests passed");
