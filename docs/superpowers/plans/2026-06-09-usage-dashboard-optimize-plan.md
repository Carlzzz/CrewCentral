# 用量分析页面优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用量分析页面三处优化：修复总调用次数 10K 截断、扩展时间筛选器（3月/半年/年/自定义）、用户名与模型筛选改为下拉多选

**Architecture:** 后端新增 `/admin/usage/filters` 接口提供筛选选项，现有接口参数改为逗号分隔多选并修复 ES track_total_hits；前端新增 MultiSelect 多选下拉组件，扩展时间筛选预设+自定义日期，所有筛选器变化自动联动三个数据面板

**Tech Stack:** Python/FastAPI/Elasticsearch（后端）、React 18/TypeScript/Tailwind CSS（前端）

---

### Task 1: 后端 — 修复 overview total_calls 截断 + 放开 trend days 上限

**Files:**
- Modify: `backend/app/api/routes/usage_admin.py`

- [ ] **Step 1: 在 overview 查询 body 中添加 track_total_hits**

在 `usage_overview` 函数的 body dict 中添加 `"track_total_hits": True`：

```python
body = {
    "size": 0,
    "track_total_hits": True,
    "query": {"bool": {"filter": filters}},
    "aggs": {...},
}
```

- [ ] **Step 2: 将 trend 的 days 参数上限从 90 改为 366**

找到 `usage_trend` 函数签名，修改：

```python
# 之前
days: int = Query(14, ge=1, le=90),
# 之后
days: int = Query(14, ge=1, le=366),
```

- [ ] **Step 3: 验证**

```bash
cd backend && uv run python -c "from app.api.routes.usage_admin import router; print('OK')"
```

确认语法无误。

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/usage_admin.py
git commit -m "fix: add track_total_hits to usage overview, extend trend days limit to 366"
```

---

### Task 2: 后端 — 实现多选参数解析 + terms 查询适配

**Files:**
- Modify: `backend/app/api/routes/usage_admin.py`

- [ ] **Step 1: 添加 _parse_multi 工具函数**

在文件的 import 区域之后、router 之前添加：

```python
def _parse_multi(param: str | None) -> list[str] | None:
    """将逗号分隔的字符串解析为列表，用于多选筛选"""
    if not param:
        return None
    result = [v.strip() for v in param.split(",") if v.strip()]
    return result if result else None
```

- [ ] **Step 2: 修改 usage_overview — username 支持多选**

在 `usage_overview` 函数中，将单值 term 查询改为 terms：

```python
# 之前
if username:
    filters.append({"term": {"username.keyword": username}})

# 之后
usernames = _parse_multi(username)
if usernames:
    filters.append({"terms": {"username.keyword": usernames}})
```

- [ ] **Step 3: 修改 usage_trend — username 支持多选**

同样变更应用到 `usage_trend` 函数。

- [ ] **Step 4: 修改 usage_records — username 和 modelid 支持多选**

```python
# 之前
if username:
    filters.append({"term": {"username.keyword": username}})
if modelid:
    filters.append({"term": {"modelid.keyword": modelid}})

# 之后
usernames = _parse_multi(username)
if usernames:
    filters.append({"terms": {"username.keyword": usernames}})
modelids = _parse_multi(modelid)
if modelids:
    filters.append({"terms": {"modelid.keyword": modelids}})
```

- [ ] **Step 5: 验证**

```bash
cd backend && uv run python -c "from app.api.routes.usage_admin import router, _parse_multi; assert _parse_multi('a,b,c') == ['a','b','c']; assert _parse_multi(None) is None; assert _parse_multi('') is None; print('OK')"
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/usage_admin.py
git commit -m "feat: support multi-select username/modelid via comma-separated terms query"
```

---

### Task 3: 后端 — 新增 GET /admin/usage/filters 接口

**Files:**
- Modify: `backend/app/api/routes/usage_admin.py`

- [ ] **Step 1: 添加 filters 路由**

在 `usage_admin.py` 文件末尾添加新接口：

```python
@router.get("/filters")
async def usage_filters(
    _: Request,
    __: User = Depends(require_session_permission("usage")),
) -> dict:
    """返回所有去重的用户名和模型列表，供前端下拉筛选使用"""
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置（请在 .env 设置 ES_NODE）")

    async def _collect_composite(source_field: str) -> list[str]:
        """通过 composite aggregation 收集所有去重值"""
        items: list[str] = []
        after_key: dict | None = None
        keyword_field = f"{source_field}.keyword"
        while True:
            composite: dict = {
                "sources": [{"val": {"terms": {"field": keyword_field}}}],
                "size": 10000,
            }
            if after_key:
                composite["after"] = after_key
            body = {
                "size": 0,
                "aggs": {
                    "comp": {
                        "composite": composite,
                    }
                },
            }
            result = await es_search(body)
            buckets = result.get("aggregations", {}).get("comp", {}).get("buckets", [])
            for b in buckets:
                key = b.get("key", {}).get("val")
                if key:
                    items.append(key)
            after_key = result.get("aggregations", {}).get("comp", {}).get("after_key")
            if not after_key or not buckets:
                break
        return sorted(items)

    users = await _collect_composite("username")
    models = await _collect_composite("modelid")

    return rc_ok({"users": users, "models": models})
```

- [ ] **Step 2: 验证语法**

```bash
cd backend && uv run python -c "from app.api.routes.usage_admin import router; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/usage_admin.py
git commit -m "feat: add GET /admin/usage/filters endpoint for user/model dropdown options"
```

---

### Task 4: 前端 API 层 — 适配多选参数 + 新增 fetchFilterOptions

**Files:**
- Modify: `frontend/src/lib/usage-api.ts`

- [ ] **Step 1: 修改 qs 工具函数支持逗号分隔的字符串**

当前 `qs` 函数已支持 string 类型参数。此场景不需要修改，因为在调用方已 join 为逗号字符串。

- [ ] **Step 2: 新增 fetchFilterOptions 函数**

在 `usage-api.ts` 文件末尾添加：

```typescript
export type FilterOptions = {
  users: string[];
  models: string[];
};

export function fetchFilterOptions(): Promise<RcResponse<FilterOptions>> {
  return getJson("/admin/usage/filters");
}
```

- [ ] **Step 3: 无需修改现有函数签名**

现有 `fetchUsageOverview`、`fetchUsageTrend`、`fetchUsageRecords` 的 `username` 和 `modelid` 参数已经是 `string | undefined`，逗号分隔字符串可直接传入。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/usage-api.ts
git commit -m "feat: add fetchFilterOptions API for usage dashboard filters"
```

---

### Task 5: 前端 — MultiSelect 多选下拉组件

**Files:**
- Modify: `frontend/src/pages/admin/UsageDashboardPage.tsx`

- [ ] **Step 1: 在文件顶部 import 区域添加 useRef, useEffect**

当前已导入 `useRef` 和 `useEffect`，无需额外导入。

- [ ] **Step 2: 在 UsageDashboardPage 函数之前添加 MultiSelect 组件**

在 `tryPrettyJson` 函数之前、`StatCard` 之后添加：

```tsx
/* ---------- MultiSelect ---------- */
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (s: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  return (
    <div ref={containerRef} className="relative">
      {/* 输入框区域 */}
      <div
        onClick={() => setOpen(!open)}
        className={`flex min-w-[140px] cursor-pointer flex-wrap items-center gap-1 rounded-full border-0 bg-white/95 px-3 py-1.5 text-xs shadow-sm ring-1 transition ${
          open ? "ring-2 ring-sky-300" : "ring-slate-200/80"
        }`}
      >
        {selected.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700"
            >
              <span className="max-w-[80px] truncate">{v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((x) => x !== v));
                }}
                className="ml-0.5 text-sky-400 hover:text-sky-600"
              >
                ×
              </button>
            </span>
          ))
        )}
        {selected.length > 0 && selected.length < options.length && (
          <span className="text-[10px] text-slate-400">+{options.length - selected.length} more</span>
        )}
        <span className="ml-auto text-[10px] text-slate-300">▼</span>
      </div>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-300"
          />
          {options.length > 5 && (
            <div className="mb-1 flex gap-2 border-b border-slate-100 pb-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-[10px] text-sky-500 hover:text-sky-700"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                取消全选
              </button>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-slate-400">无匹配选项</p>
            ) : (
              filtered.map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 hover:bg-sky-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/UsageDashboardPage.tsx
git commit -m "feat: add MultiSelect dropdown component for usage filters"
```

---

### Task 6: 前端 — 时间筛选器扩展 + 筛选联动 + 对接 MultiSelect

**Files:**
- Modify: `frontend/src/pages/admin/UsageDashboardPage.tsx`
- Modify: `frontend/src/lib/usage-api.ts`

- [ ] **Step 1: 更新 state 与范围预设**

替换现有 state 声明区域（约第 343-350 行）：

```tsx
// --- 替换 ---
const [rangePreset, setRangePreset] = useState<"7d" | "14d" | "30d">("7d");
const [filterUser, setFilterUser] = useState("");
const [filterModel, setFilterModel] = useState("");

// --- 改为 ---
const [rangePreset, setRangePreset] = useState<"7d" | "14d" | "30d" | "3m" | "6m" | "1y" | "custom">("7d");
const [filterUsers, setFilterUsers] = useState<string[]>([]);
const [filterModels, setFilterModels] = useState<string[]>([]);
const [customStart, setCustomStart] = useState("");
const [customEnd, setCustomEnd] = useState("");
const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
```

需要从 `usage-api.ts` 导入 `FilterOptions` 类型：
```tsx
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
```

- [ ] **Step 2: 更新 gte / lte 计算逻辑**

替换第 349-350 行：

```tsx
// --- 替换 ---
const rangeDays = rangePreset === "30d" ? 30 : rangePreset === "14d" ? 14 : 7;
const gte = useMemo(() => `${daysAgo8(rangeDays)}T00:00:00.000+08:00`, [rangeDays]);

// --- 改为 ---
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
```

- [ ] **Step 3: 更新 loadAll 使用新的 state**

替换 loadAll 函数（约第 352-392 行）：

```tsx
const loadAll = useCallback(
  async (page = 1) => {
    setLoading(true);
    setErrMsg("");
    setTrendErr("");
    try {
      const username = filterUsers.length > 0 ? filterUsers.join(",") : undefined;
      const modelid = filterModels.length > 0 ? filterModels.join(",") : undefined;
      const params = { username, gte, lte };
      const [ov, tr, rc] = await Promise.all([
        fetchUsageOverview(params),
        fetchUsageTrend({ ...params, days: rangeDays || 90 }),
        fetchUsageRecords({
          ...params,
          modelid,
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
```

- [ ] **Step 4: 添加 filterOptions 初始化 useEffect**

在 loadAll 的 useEffect 之后添加：

```tsx
// 加载筛选选项（仅首次）
useEffect(() => {
  fetchFilterOptions().then((res) => {
    if (res.rc === 0 && res.data) {
      setFilterOptions(res.data);
    }
  });
}, []);
```

- [ ] **Step 5: 替换时间筛选器 UI + 用户名/模型输入为 MultiSelect**

替换筛选器 UI 区域（约第 407-443 行的按钮和输入框部分）：

```tsx
<div className="flex flex-wrap items-center gap-2">
  {(["7d", "14d", "30d", "3m", "6m", "1y", "custom"] as const).map((p) => (
    <button
      key={p}
      type="button"
      onClick={() => setRangePreset(p)}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        rangePreset === p
          ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-200"
          : "bg-white/90 text-slate-600 ring-1 ring-slate-200/80 hover:bg-sky-50"
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

  {/* 自定义日期选择器 */}
  {rangePreset === "custom" && (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={customStart}
        onChange={(e) => setCustomStart(e.target.value)}
        className="w-32 rounded-full border-0 bg-white/95 px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-200/80 focus:ring-2 focus:ring-sky-300"
      />
      <span className="text-xs text-slate-400">至</span>
      <input
        type="date"
        value={customEnd}
        onChange={(e) => setCustomEnd(e.target.value)}
        className="w-32 rounded-full border-0 bg-white/95 px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-200/80 focus:ring-2 focus:ring-sky-300"
      />
    </div>
  )}

  {/* 用户名多选 */}
  <MultiSelect
    options={filterOptions?.users ?? []}
    selected={filterUsers}
    onChange={setFilterUsers}
    placeholder="用户名"
  />

  {/* 模型多选 */}
  <MultiSelect
    options={filterOptions?.models ?? []}
    selected={filterModels}
    onChange={setFilterModels}
    placeholder="模型"
  />

  <button
    type="button"
    onClick={() => void loadAll(1)}
    className="rounded-full bg-slate-800 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-700"
  >
    查询
  </button>
</div>
```

- [ ] **Step 6: 更新 useMemo import**

在文件顶部 import 中确认 `useMemo` 已被导入（当前已有，无需修改）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/UsageDashboardPage.tsx frontend/src/lib/usage-api.ts
git commit -m "feat: extend time filter, integrate MultiSelect, wire up filter linkage"
```

---

## 验证清单

| # | 验证项 | 方法 |
|---|--------|------|
| 1 | 语法无错误 | `cd frontend && npx tsc --noEmit` |
| 2 | 后端语法无错误 | `cd backend && uv run python -c "from app.api.routes.usage_admin import router"` |
| 3 | overview total_calls 可超出 10K | 在有 > 10K 数据时检查 StatCard 显示值 |
| 4 | 时间预设切换后趋势图和排行榜刷新 | 点击「近 3 月」→ 检查 overview/trend/records 重新加载 |
| 5 | 自定义日期展开选择器 | 点击「自定义」→ 起止日期选择器出现 |
| 6 | 多选用户名筛选生效 | 选择 2 个用户 → 所有面板数据只包含这 2 个用户 |
| 7 | 多选模型筛选生效 | 选择 2 个模型 → records 表格只显示这 2 个模型 |
| 8 | 下拉搜索过滤 | 在下拉面板搜索框输入 → 选项过滤 |
| 9 | 已选标签可删除 | 点击标签 × → 取消选中 → 数据刷新 |
| 10 | 全选/取消全选 | 选项 > 5 时出现快捷按钮 |
| 11 | 点击外部关闭下拉 | 展开下拉后点击页面其他区域 → 下拉关闭 |

---

## 文件变更汇总

| 文件 | 改动 |
|------|------|
| `backend/app/api/routes/usage_admin.py` | + `_parse_multi` 工具函数, overview 加 `track_total_hits`, trend `days` le→366, username/modelid `term`→`terms`, 新增 `GET /filters` |
| `frontend/src/lib/usage-api.ts` | + `FilterOptions` 类型, + `fetchFilterOptions()` |
| `frontend/src/pages/admin/UsageDashboardPage.tsx` | + `MultiSelect` 组件, state 改为多选数组, 时间预设扩展, 自定义日期, 筛选联动 |
