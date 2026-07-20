import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import TopNavBar from "../components/layout/TopNavBar";
import {
  AvgTokensPanel,
  BarChart,
  CallsPanel,
  ChartModal,
  KpiTile,
  MultiSelect,
  TrendChart,
  daysAgo8,
  fmtNum,
} from "../components/usage/UsageCharts";
import { fetchSessionUserinfo } from "../lib/api";
import {
  fetchMyUsageFilters,
  fetchMyUsageOverview,
  fetchMyUsageTrend,
  type DayBucket,
  type MyFilterOptions,
  type MyUsageOverview,
} from "../lib/usage-account-api";

type RangePreset = "7d" | "14d" | "30d" | "3m" | "6m" | "1y" | "custom";

const RANGE_PRESETS: RangePreset[] = ["7d", "14d", "30d", "3m", "6m", "1y", "custom"];
const PRESET_LABEL: Record<RangePreset, string> = {
  "7d": "近 7 天",
  "14d": "近 14 天",
  "30d": "近 30 天",
  "3m": "近 3 月",
  "6m": "近半年",
  "1y": "近一年",
  custom: "自定义",
};
const PRESET_DAYS: Record<Exclude<RangePreset, "custom">, number> = {
  "7d": 7, "14d": 14, "30d": 30, "3m": 90, "6m": 180, "1y": 365,
};

export default function MyUsagePage() {
  const [authState, setAuthState] = useState<"loading" | "out" | "in">("loading");
  const [displayName, setDisplayName] = useState("");

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [trendErr, setTrendErr] = useState("");
  const [overview, setOverview] = useState<MyUsageOverview | null>(null);
  const [trend, setTrend] = useState<DayBucket[]>([]);

  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [filterModels, setFilterModels] = useState<string[]>([]);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterOptions, setFilterOptions] = useState<MyFilterOptions | null>(null);
  const [modalChart, setModalChart] = useState<"trend" | "model" | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (!u) { setAuthState("out"); return; }
      setDisplayName(u.display_name || u.username || u.email || "");
      setAuthState("in");
    })();
  }, []);

  const rangeDays = rangePreset === "custom" ? 0 : (PRESET_DAYS[rangePreset] ?? 7);

  const gte = useMemo(() => {
    if (rangePreset === "custom" && customStart) {
      return `${customStart}T00:00:00.000+08:00`;
    }
    return `${daysAgo8(rangeDays || 7)}T00:00:00.000+08:00`;
  }, [rangePreset, customStart, rangeDays]);

  const lte = useMemo(() => {
    if (rangePreset === "custom" && customEnd) {
      return `${customEnd}T23:59:59.999+08:00`;
    }
    return undefined;
  }, [rangePreset, customEnd]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrMsg("");
    setTrendErr("");
    try {
      const modelid = filterModels.length > 0 ? filterModels.join(",") : undefined;
      const params = { modelid, gte, lte };
      const [ov, tr] = await Promise.all([
        fetchMyUsageOverview(params),
        fetchMyUsageTrend({ ...params, days: rangeDays || 90 }),
      ]);
      if (ov.rc !== 0) {
        setErrMsg(ov.message);
      } else {
        setOverview(ov.data ?? null);
      }
      if (tr.rc === 0) {
        setTrend(tr.data ?? []);
      } else {
        setTrend([]);
        setTrendErr(tr.message || "趋势数据加载失败");
      }
    } catch (e) {
      setErrMsg(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterModels, gte, lte, rangeDays]);

  // 模型筛选选项（仅当前用户用过的模型，仅首次加载）
  useEffect(() => {
    void (async () => {
      const res = await fetchMyUsageFilters();
      if (res.rc === 0 && res.data) setFilterOptions(res.data);
    })();
  }, []);

  useEffect(() => {
    if (authState === "in") void loadAll();
  }, [loadAll, authState]);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNavBar />
        <div className="flex items-center justify-center py-24 text-sm text-slate-400">加载中…</div>
      </div>
    );
  }
  if (authState === "out") {
    return <Navigate to="/login" replace />;
  }

  // input_token 上报口径不含缓存命中部分，真实总输入 = 新输入 + 缓存命中
  const totalInputTokens = overview
    ? overview.total_input_tokens + overview.total_cached_tokens
    : 0;
  const cacheHitPct = totalInputTokens > 0
    ? (overview!.total_cached_tokens / totalInputTokens) * 100
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的用量</h1>
            <p className="mt-1 text-sm text-slate-500">
              {displayName ? `${displayName}，看看你的 Token 都花哪儿啦` : "看看你的 Token 都花哪儿啦"}
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {loading ? "加载中…" : overview ? `共 ${overview.total_calls} 次调用` : ""}
          </span>
        </div>

        {/* 筛选器卡片 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRangePreset(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  rangePreset === p
                    ? "bg-sky-500 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-sky-50"
                }`}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}

            {rangePreset === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-32 rounded-full border-0 bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-sky-300"
                />
                <span className="text-xs text-slate-400">至</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-32 rounded-full border-0 bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-sky-300"
                />
              </div>
            )}

            <MultiSelect
              options={filterOptions?.models ?? []}
              selected={filterModels}
              onChange={setFilterModels}
              placeholder="模型"
            />
          </div>
        </div>

        {errMsg && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errMsg}
          </div>
        )}

        {loading && !overview ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
            加载中…
          </div>
        ) : overview ? (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <KpiTile label="总调用次数" value={fmtNum(overview.total_calls)} sub="所选范围合计" emphasis="sky" />
              <KpiTile
                label="输入 Tokens"
                value={fmtNum(overview.total_input_tokens)}
                sub={`缓存 ${fmtNum(overview.total_cached_tokens)}`}
                emphasis="violet"
              />
              <KpiTile label="输出 Tokens" value={fmtNum(overview.total_output_tokens)} emphasis="amber" />
              <KpiTile
                label="总 Tokens"
                value={fmtNum(totalInputTokens + overview.total_output_tokens)}
                sub="输入 + 输出"
                emphasis="emerald"
              />
              <KpiTile
                label="缓存命中率"
                value={cacheHitPct === null ? "-" : `${cacheHitPct.toFixed(1)}%`}
                sub={cacheHitPct === null ? "无输入 Tokens" : `缓存 ${fmtNum(overview.total_cached_tokens)}`}
              />
            </div>

            {/* 趋势主图 + 右侧小面板 */}
            <div
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              onClick={() => setModalChart("trend")}
            >
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-800">每日 Token 趋势</div>
                  <div className="mt-0.5 text-xs text-slate-500">主图仅显示 Tokens（单 y 轴），调用次数见右侧面板</div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">{trend.length} 天</span>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="relative rounded-2xl border border-slate-200 bg-white p-3">
                  {trendErr ? (
                    <p className="rounded-xl bg-rose-50 px-2 py-2 text-[11px] text-rose-700">{trendErr}</p>
                  ) : null}
                  <TrendChart data={trend} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <CallsPanel data={trend} />
                  <AvgTokensPanel data={trend} />
                </div>
              </div>
            </div>

            {/* 按模型 */}
            <div
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              onClick={() => setModalChart("model")}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700">按模型</h3>
                <span className="text-[10px] text-slate-400" title="点击放大查看">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 3h5M3 3v5M17 17h-5m5 0v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </span>
              </div>
              <BarChart
                data={overview.by_model}
                labelKey="model"
                valueKeys={["input_tokens", "output_tokens"]}
                valueLabels={["输入", "输出"]}
                colors={["#0ea5e9", "#8b5cf6"]}
                maxHeight="320px"
              />
            </div>

            {/* 放大弹窗 */}
            <ChartModal open={modalChart === "trend"} onClose={() => setModalChart(null)} title="每日 Token 趋势（放大）">
              <TrendChart data={trend} enlarged />
            </ChartModal>
            <ChartModal open={modalChart === "model"} onClose={() => setModalChart(null)} title="按模型分布（放大）">
              <div className="max-h-[70vh] overflow-y-auto">
                <BarChart
                  data={overview.by_model}
                  labelKey="model"
                  valueKeys={["input_tokens", "output_tokens"]}
                  valueLabels={["输入", "输出"]}
                  colors={["#0ea5e9", "#8b5cf6"]}
                  maxHeight="60vh"
                />
              </div>
            </ChartModal>
          </>
        ) : null}
      </div>
    </div>
  );
}
