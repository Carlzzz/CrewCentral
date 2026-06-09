# 用量分析页面优化 — 设计文档

## 概述

优化 CrewCentral 管理后台「用量分析」页面，解决三个问题：
1. 总调用次数被 ES 10K 默认截断
2. 时间筛选器缺少更长时间范围（3月/半年/年/自定义）
3. 用户名和模型筛选器改为下拉多选

## 影响范围

| 层 | 文件 | 改动类型 |
|---|------|----------|
| 后端 | `backend/app/api/routes/usage_admin.py` | 修改 3 个现有接口 + 新增 1 个 filter 接口 |
| 前端 API | `frontend/src/lib/usage-api.ts` | 新增 `fetchFilterOptions`，修改现有函数签名 |
| 前端页面 | `frontend/src/pages/admin/UsageDashboardPage.tsx` | 大幅修改：时间筛选器、MultiSelect 组件、联动逻辑 |

## 后端设计

### 1. 修复 overview total_calls 截断

**问题**：`/admin/usage/overview` 的 ES 查询 body 缺少 `"track_total_hits": true`，ES 默认在 10,000 条处停止计数。

**修复**：在 overview 查询 body 中添加 `"track_total_hits": true`。

```python
body = {
    "size": 0,
    "track_total_hits": True,   # ← 新增
    "query": {"bool": {"filter": filters}},
    "aggs": {...},
}
```

### 2. 多选筛选支持（username / modelid）

**变更**：`overview`、`trend`、`records` 三个接口的 `username` 和 `modelid` 参数支持逗号分隔多值。

**解析方式**：每个接口内部解析逗号分隔字符串为列表。

```python
def _parse_multi(param: str | None) -> list[str] | None:
    if not param:
        return None
    return [v.strip() for v in param.split(",") if v.strip()]
```

**ES 查询适配**：当多个值传入时，`term` 改为 `terms`。

```python
# 之前
if username:
    filters.append({"term": {"username.keyword": username}})

# 之后
usernames = _parse_multi(username)
if usernames:
    filters.append({"terms": {"username.keyword": usernames}})
```

### 3. 新增 GET /admin/usage/filters

返回所有可选的用户名和模型列表（全量去重，不受当前时间范围限制）。

**ES 实现**：使用 composite aggregation 获取去重列表。

```
GET .../_search
{
  "size": 0,
  "aggs": {
    "users": {
      "composite": {
        "sources": [{"username": {"terms": {"field": "username.keyword"}}}],
        "size": 10000
      }
    },
    "models": {
      "composite": {
        "sources": [{"modelid": {"terms": {"field": "modelid.keyword"}}}],
        "size": 10000
      }
    }
  }
}
```

**响应格式**：`rc_ok({ "users": ["user1", "user2", ...], "models": ["gpt4", "claude", ...] })`

**NOTE**: 如果去重用户数或模型数超过 10K，需要通过 composite aggregation 的 `after` key 循环翻页收集。实际场景中 10K 以内足够覆盖。

### 4. Trend days 参数上限调整

`/admin/usage/trend` 的 `days` 参数限制需从 `le=90` 放宽至 `le=366`，以支持近一年范围：

```python
# 之前
days: int = Query(14, ge=1, le=90)
# 之后
days: int = Query(14, ge=1, le=366)
```

## 前端设计

### 1. 时间筛选器扩展

当前三个按钮 `["7d", "14d", "30d"]`，扩展为：

| 预设值 | 显示文本 | 对应天数 |
|--------|----------|----------|
| `7d` | 近 7 天 | 7 |
| `14d` | 近 14 天 | 14 |
| `30d` | 近 30 天 | 30 |
| `3m` | 近 3 月 | 90 |
| `6m` | 近半年 | 180 |
| `1y` | 近一年 | 365 |
| `custom` | 自定义 | 用户指定起止日期 |

**自定义模式**：
- 点击「自定义」按钮后，按钮下方展开两个 `<input type="date">` 起止日期选择器
- 选择起止日期后，清空预设选中状态，计算 days = (end - start)
- 查询时传递 `gte` 和 `lte` 参数，不传 `days`（trend 的 `days` 由前端根据日期差计算）

**范围天数计算**：自定义模式下 `gte = startDate + "T00:00:00.000+08:00"`, `lte = endDate + "T23:59:59.999+08:00"`；trend `days` 参数根据日期差计算。

### 2. MultiSelect 下拉多选组件

在 `UsageDashboardPage.tsx` 文件内定义（纯内部组件，不单独抽取文件）。

**结构**：
```
┌─────────────────────────────────────┐
│ 🔍 输入关键词...              ▼    │  ← 输入框，点击展开
├─────────────────────────────────────┤
│ ☑ user1  ☑ user2  ☐ user3         │  ← 下拉面板（下拉项可为空时直接展示所有选项）
│ ☐ user4  ☐ user5                   │
└─────────────────────────────────────┘
```

或者选中后的展示：
```
┌─────────────────────────────────────┐
│ [user1 ×] [user2 ×] 输入...     ▼  │  ← 已选项以标签形式显示
└─────────────────────────────────────┘
```

**关键行为**：
- 加载时调用 `fetchFilterOptions()` 获取全量 users/models 列表
- 点击输入框展开下拉面板，再次点击或点击外部关闭
- 下拉面板顶部有搜索输入，可过滤选项
- 每个选项左侧 checkbox，点击切换选中状态
- 已选项在主输入框内以可删除标签显示（点击 × 取消选中）
- 支持「全选 / 取消全选」快捷操作（当选项 > 5 时显示）
- 确认选择后（点击外部或按 Escape 关闭面板），自动触发查询

**Props**：
```
{
  options: string[]        // 全部可选项
  selected: string[]       // 当前选中值
  onChange: (s: string[]) => void  // 选中变化回调
  placeholder: string      // 占位文本
}
```

### 3. 数据联动逻辑

所有筛选器变化 → 重置 page=1 → 同时调用 overview、trend、records。

**触发链路**：
1. 时间预设变化 → `setRangePreset(newPreset)` → `useEffect` 自动调用 `loadAll(1)`
2. 用户/模型多选变化 → `setFilterUsers(newUsers)` / `setFilterModels(newModels)` → `useEffect` 自动调用 `loadAll(1)`
3. 自定义日期变化 → `setCustomDateRange({gte, lte})` → `useEffect` 触发

**依赖数组**：`useEffect(() => { loadAll(1) }, [filterUsers, filterModels, gte, lte])`

### 4. API 层适配

在 `usage-api.ts` 中：

- **新增** `fetchFilterOptions(): Promise<RcResponse<{users: string[], models: string[]}>>`
- `fetchUsageOverview`、`fetchUsageTrend`、`fetchUsageRecords` 的 `username` 参数改为支持逗号分隔字符串（由调用方 join）

**参数构建**：
```ts
const username = filterUsers.length > 0 ? filterUsers.join(",") : undefined;
const modelid = filterModels.length > 0 ? filterModels.join(",") : undefined;
```

## 状态管理

页面内部 state 变更（不使用全局状态管理）：

```ts
// 替换
- const [filterUser, setFilterUser] = useState("");
- const [filterModel, setFilterModel] = useState("");
- const [rangePreset, setRangePreset] = useState<"7d" | "14d" | "30d">("7d");

// 新增/变更
+ const [filterUsers, setFilterUsers] = useState<string[]>([]);
+ const [filterModels, setFilterModels] = useState<string[]>([]);
+ const [rangePreset, setRangePreset] = useState<"7d" | "14d" | "30d" | "3m" | "6m" | "1y" | "custom">("7d");
+ const [customStart, setCustomStart] = useState("");
+ const [customEnd, setCustomEnd] = useState("");
+ const [filterOptions, setFilterOptions] = useState<{users: string[], models: string[]}>();

// gte 计算逻辑调整
+ const daysMap = { "7d": 7, "14d": 14, "30d": 30, "3m": 90, "6m": 180, "1y": 365 };
+ const gte = customStart ? `${customStart}T00:00:00.000+08:00` : `${daysAgo8(daysMap[rangePreset])}T00:00:00.000+08:00`;
+ const lte = customEnd ? `${customEnd}T23:59:59.999+08:00` : undefined;
```

## 测试要点

| 场景 | 预期行为 |
|------|----------|
| 总调用数 > 10K | overview total_calls 显示真实数字（如 15623 而非 10000）|
| 选择近 3 月 | 趋势图显示 90 天数据，按模型/用户排行榜刷新 |
| 选择自定义时间 | 展开日期选择器，选择后自动查询 |
| 多选 2 个用户 | overview/trend/records 均筛选这 2 个用户的数据 |
| 多选 3 个模型 | records 表格显示这 3 个模型的记录 |
| 下拉搜索 | 输入关键词过滤选项，checkbox 可切换 |
| 已选标签删除 | 点击 × 取消该选项，自动触发查询 |
| 空状态 | 下拉无选项/无匹配时展示空提示 |
| ES 未配置 | 所有接口返回 ES 未配置错误，前端展示错误信息 |
