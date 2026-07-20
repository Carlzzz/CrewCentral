import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchUsageOverview,
  fetchUsageTrend,
  fetchUsageRecords,
  fetchFilterOptions,
  type UsageOverview,
  type DayBucket,
  type UsageRecord,
  type FilterOptions,
} from "../../lib/usage-api";
import {
  AvgTokensPanel,
  BarChart,
  CallsPanel,
  ChartModal,
  EMPTY_HINT,
  KpiTile,
  MultiSelect,
  TrendChart,
  daysAgo8,
  fmtNum,
  tryPrettyJson,
} from "../../components/usage/UsageCharts";

export default function UsageDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [trendErr, setTrendErr] = useState("");
  const [overview, setOverview] = useState<UsageOverview | null>(null);
  const [trend, setTrend] = useState<DayBucket[]>([]);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);

  const [rangePreset, setRangePreset] = useState<"7d" | "14d" | "30d" | "3m" | "6m" | "1y" | "custom">("7d");
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [filterModels, setFilterModels] = useState<string[]>([]);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [modalChart, setModalChart] = useState<"trend" | "model" | "user" | null>(null);

  const daysPreset: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "3m": 90, "6m": 180, "1y": 365 };
  const rangeDays = rangePreset === "custom" ? 0 : (daysPreset[rangePreset] ?? 7);

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

  const loadAll = useCallback(
    async (page = 1) => {
      setLoading(true);
      setErrMsg("");
      setTrendErr("");
      try {
        const username = filterUsers.length > 0 ? filterUsers.join(",") : undefined;
        const modelid = filterModels.length > 0 ? filterModels.join(",") : undefined;
        const params = { username, modelid, gte, lte };
        const [ov, tr, rc] = await Promise.all([
          fetchUsageOverview(params),
          fetchUsageTrend({ ...params, days: rangeDays || 90 }),
          fetchUsageRecords({
            ...params,
            page,
            page_size: 30,
          }),
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
        if (rc.rc === 0 && rc.data) {
          setRecords(rc.data.items);
          setRecordsTotal(rc.data.total);
          setRecordsPage(rc.data.page);
        }
      } catch (e) {
        setErrMsg(String(e));
      } finally {
        setLoading(false);
      }
    },
    [filterUsers, filterModels, gte, lte, rangeDays],
  );

  // 加载筛选选项（仅首次）
  useEffect(() => {
    fetchFilterOptions().then((res) => {
      if (res.rc === 0 && res.data) {
        setFilterOptions(res.data);
      }
    });
  }, []);

  useEffect(() => {
    void loadAll(1);
  }, [loadAll]);

  const totalPages = Math.ceil(recordsTotal / 30) || 1;

  // input_token 上报口径不含缓存命中部分，真实总输入 = 新输入 + 缓存命中
  const totalInputTokens = overview
    ? overview.total_input_tokens + overview.total_cached_tokens
    : 0;
  const cacheHitPct = totalInputTokens > 0
    ? (overview!.total_cached_tokens / totalInputTokens) * 100
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">用量分析</h1>
            <p className="mt-1 text-sm text-slate-500">看看大家把 Token 花哪儿啦</p>
          </div>
          <span className="text-xs text-slate-400">
            {loading ? "加载中…" : overview ? `共 ${overview.total_calls} 次调用` : ""}
          </span>
        </div>

        {/* 筛选器卡片 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {(["7d", "14d", "30d", "3m", "6m", "1y", "custom"] as const).map((p) => (
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
                {p === "7d"
                  ? "近 7 天"
                  : p === "14d"
                    ? "近 14 天"
                    : p === "30d"
                      ? "近 30 天"
                      : p === "3m"
                        ? "近 3 月"
                        : p === "6m"
                          ? "近半年"
                          : p === "1y"
                            ? "近一年"
                            : "自定义"}
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
              options={filterOptions?.users ?? []}
              selected={filterUsers}
              onChange={setFilterUsers}
              placeholder="用户名"
            />

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

            {/* 按模型 / 按用户 */}
            <div className="grid gap-4 md:grid-cols-2">
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
                  maxHeight="240px"
                />
              </div>
              <div
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                onClick={() => setModalChart("user")}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-700">按用户</h3>
                  <span className="text-[10px] text-slate-400" title="点击放大查看">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 3h5M3 3v5M17 17h-5m5 0v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </span>
                </div>
                <BarChart
                  data={overview.by_user}
                  labelKey="username"
                  valueKeys={["input_tokens", "output_tokens"]}
                  valueLabels={["输入", "输出"]}
                  colors={["#0ea5e9", "#8b5cf6"]}
                  maxHeight="240px"
                />
              </div>
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
            <ChartModal open={modalChart === "user"} onClose={() => setModalChart(null)} title="按用户分布（放大）">
              <div className="max-h-[70vh] overflow-y-auto">
                <BarChart
                  data={overview.by_user}
                  labelKey="username"
                  valueKeys={["input_tokens", "output_tokens"]}
                  valueLabels={["输入", "输出"]}
                  colors={["#0ea5e9", "#8b5cf6"]}
                  maxHeight="60vh"
                />
              </div>
            </ChartModal>

            {/* 明细表 */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <h3 className="text-xs font-semibold text-slate-700">调用明细</h3>
                <span className="text-[10px] text-slate-400">共 {recordsTotal} 条</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="px-3 py-2 font-medium">时间</th>
                      <th className="px-3 py-2 font-medium">用户</th>
                      <th className="px-3 py-2 font-medium">模型</th>
                      <th className="px-3 py-2 text-right font-medium">输入</th>
                      <th className="px-3 py-2 text-right font-medium">输出</th>
                      <th className="px-3 py-2 text-right font-medium">缓存</th>
                      <th className="px-3 py-2 text-right font-medium">耗时</th>
                      <th className="px-3 py-2 font-medium">routing_key</th>
                      <th className="px-3 py-2 font-medium">session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                          {EMPTY_HINT}
                        </td>
                      </tr>
                    ) : (
                      records.map((r, i) => (
                        <Fragment key={`${r.start_time}-${i}`}>
                          <tr
                            className={`cursor-pointer border-b border-slate-50 transition hover:bg-sky-50/50 ${
                              expandedRow === i ? "bg-sky-50/60" : ""
                            }`}
                            onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                          >
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                              {r.start_time?.slice(5, 19).replace("T", " ")}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{r.username ?? "-"}</td>
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                {r.modelid}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {fmtNum(r.input_token)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {fmtNum(r.output_token)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                              {r.input_cached_token > 0 ? fmtNum(r.input_cached_token) : "-"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                              {r.cost_time}s
                            </td>
                            <td className="max-w-[120px] truncate px-3 py-2 text-slate-500" title={r.routing_key ?? ""}>
                              {r.routing_key ?? "-"}
                            </td>
                            <td className="max-w-[120px] truncate px-3 py-2 text-slate-500" title={r.session_id ?? ""}>
                              {r.session_id ?? "-"}
                            </td>
                          </tr>
                          {expandedRow === i ? (
                            <tr className="bg-slate-50/80">
                              <td colSpan={9} className="px-3 py-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <p className="mb-1 text-[10px] font-medium text-slate-400">请求摘要</p>
                                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-white p-2 text-[10px] text-slate-600">
                                      {r.input_content ? tryPrettyJson(r.input_content) : "(无)"}
                                    </pre>
                                  </div>
                                  <div>
                                    <p className="mb-1 text-[10px] font-medium text-slate-400">响应内容</p>
                                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-white p-2 text-[10px] text-slate-600">
                                      {r.output_content || "(无)"}
                                    </pre>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-400">
                                  <span>流式: {r.stream ? "是" : "否"}</span>
                                  {r.session_id ? <span>会话: {r.session_id}</span> : null}
                                  {r.routing_key ? <span>路由: {r.routing_key}</span> : null}
                                  {r.clientid ? <span>客户端: {r.clientid}</span> : null}
                                  {r.input_cached_token > 0 ? (
                                    <span>缓存命中: {fmtNum(r.input_cached_token)}</span>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-3 py-2.5">
                  <button
                    type="button"
                    disabled={recordsPage <= 1}
                    onClick={() => void loadAll(recordsPage - 1)}
                    className="rounded-full px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {recordsPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={recordsPage >= totalPages}
                    onClick={() => void loadAll(recordsPage + 1)}
                    className="rounded-full px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
