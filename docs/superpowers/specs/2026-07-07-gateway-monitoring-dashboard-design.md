# 网关实时监控大屏 设计文档

- **日期**: 2026-07-07
- **状态**: Draft（待用户复核）
- **关联仓库**: `CrewCentral`（前端大屏 + 后端代理，交付主体）、`CrewProxy`（新增 `/metrics` 端点 + 指标/配额采集）
- **作者**: Carlzzz / Claude

---

## 1. 背景与目标

让 CrewProxy 网关的运行状态可视化：在一个实时大屏里看到多个 Provider 的连接状态、实时调用情况、成功率、token plan 池子的负载均衡、各池子调用次数，以及 GLM/MiniMax 的套餐配额剩余；池子进入冷却时用不同颜色醒目提示。

大屏集成在 CrewCentral，新建一个页面。

### 成功标准
- 大屏能秒级（3s）反映网关的调用次数、成功率、token、耗时
- 每个 Provider 的健康状态（healthy/degraded/down）和冷却情况一目了然
- 条形图展示各 credential 近 1h 调用次数，冷却中的 key 颜色不同
- GLM/MiniMax 每个 key 的 5h/周配额剩余百分比 + 重置倒计时自动刷新（不依赖手动填）
- 配额查询不泄露 API key（key 不出网关）

---

## 2. 现状分析

### CrewProxy（TS/Node，:3456，无框架，原生 http）
- `GET /healthz` → 仅 `{ok:true}`
- `GET /models` → 模型列表，**有鉴权**（`extractClientApiKey` + `authenticateRequest`）
- `GET /pool-status` → 每个 upstream 下各 credential 的 `inCooldown / cooldownUntil / requestsLast1h / inFlight`，**无鉴权**
- `POST /v1/messages` → 主代理入口
- 多 key 池逻辑在 `src/codePlanPool.ts`（cooldown/inFlight/1h 滑窗都已可内存查询）
- 用量只落 JSONL（`src/usageLogger.ts`），**失败请求不写 usage 行**；可选每 10min 同步 ES（独立进程）
- **完全没有**：调用次数/成功率/token 速率的内存聚合；GLM/MiniMax 配额获取逻辑；主动健康检查

### CrewCentral（React18 + TS + Vite + Tailwind；后端 FastAPI）
- 后端已有 `crew_proxy_url=http://localhost:3456` 和 `crew_proxy_api_key` 配置
- 现有唯一调 CrewProxy 的接口：`backend/app/api/routes/models_admin.py` 的 `GET /admin/models/available` → 转发 `{crew_proxy_url}/models`
- 前端 `lib/api.ts` 统一封装 `getJson`（信封 `RcResponse{T}`，`rc===0` 成功），各领域 `lib/*-api.ts`
- 已有 `pages/admin/UsageDashboardPage.tsx`（手写 BarChart），但**无图表库依赖**
- admin 页面挂在 `App.tsx` 的 `<Route path="/admin" element={<AdminLayout/>}>` 下，自带 `TopNavBar` + 权限校验
- 参考样本：`pages/admin/ModelPermissionPage.tsx`、`pages/admin/AdminLayout.tsx`

### cc-switch（参考实现，Tauri/Rust）
`cc-switch/src-tauri/src/services/coding_plan.rs` 已实现并测过 GLM、MiniMax、Kimi、火山、ZenMux 的官方配额查询接口，逻辑可直接翻译成 TS。本设计复用其 GLM 与 MiniMax 部分。

---

## 3. 总体架构与数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ CrewCentral 前端 (React + echarts)                               │
│  pages/admin/GatewayDashboardPage.tsx        每 3s 轮询          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GET /api/v1/admin/gateway/metrics
┌──────────────────────────▼──────────────────────────────────────┐
│ CrewCentral 后端 (FastAPI)                                       │
│  routes/gateway_admin.py → 转发，Authorization: Bearer           │
│                            crew_proxy_api_key                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GET http://localhost:3456/metrics
┌──────────────────────────▼──────────────────────────────────────┐
│ CrewProxy (Node/TS, :3456)                                       │
│  ┌──────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ /metrics │←─│ MetricsCollector │  │ QuotaFetcher (每 60s)   │ │
│  │ 合并三块  │  │ 主路径埋点       │  │ 调 GLM/MiniMax 官方接口 │ │
│  └──────────┘  └─────────────────┘  └─────────────────────────┘ │
│        ↑复用 CodePlanPool 现有 cooldown/inFlight/1h-count         │
└─────────────────────────────────────────────────────────────────┘
```

三层职责：**采集与配额查询都在 CrewProxy**（key 不出网关），CrewCentral 后端只做鉴权转发，前端只做展示。

---

## 4. CrewProxy 改动

### 4.1 新增 `src/metricsCollector.ts`

在 `src/proxy.ts` 的 `handleRequest` 主路径埋点，**成功和失败都记**（修复"失败不进 ES → 成功率算不出"的老问题）。

**时间桶聚合**（控制内存）：
- 桶大小 10s，每维度保留 360 桶（=1h）
- 维度键：`upstreamId` / `credentialId` / `model`
- 每桶字段：`count, success, fail, inputTokens, outputTokens, costMsSum`

**接口**：
```ts
class MetricsCollector {
  record(event: {
    upstreamId: string; credentialId?: string; model?: string;
    success: boolean; inputTokens: number; outputTokens: number;
    costMs: number; ts: number;
  }): void;
  // 聚合指定窗口（秒）的统计，按 upstreamId 维度
  aggregate(windowSec: number): Map<upstreamId, WindowStats>;
  // 按 credentialId 维度（池子条形图用）
  aggregateByCredential(windowSec: number): Map<credentialId, WindowStats>;
}
```
`WindowStats = { count, success, fail, successRate, inputTokens, outputTokens, avgCostMs }`

内存评估：6 provider × 360 桶 × 约 48 字节 ≈ 几十 KB，可忽略。

### 4.2 新增 `src/quotaFetcher.ts`（照搬 cc-switch）

每 60s 遍历所有启用 code plan 池的 upstream，按 `baseURL` 探测 provider，调官方接口，缓存结果（含 `queriedAt` 与 `error`）。

| Provider | 端点 | 鉴权 | 解析（取值字段） |
|---|---|---|---|
| GLM/智谱 | `GET {base}/api/monitor/usage/quota/limit`，base 由 `baseURL` 决定：含 `bigmodel.cn`→`https://open.bigmodel.cn`，否则 `https://api.z.ai` | `Authorization: {apiKey}`（**裸 key，无 Bearer**） | `data.limits[]` 中 `type=="TOKENS_LIMIT"`：`unit==3`→5h、`unit==6`→周；`percentage`=已用%；`nextResetTime`(ms)=重置 |
| MiniMax | `GET https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains`（国际站 `api.minimax.io`） | `Authorization: Bearer {apiKey}` | `model_remains[]` 取 `model_name=="general"`：5h=`current_interval_remaining_percent`(剩余%，`100-remaining`=已用)+`end_time`(ms)；周=`current_weekly_remaining_percent`(仅 `current_weekly_status==1` 有效)+`weekly_end_time` |

实现要点（直接从 `coding_plan.rs` 翻译）：
- 业务错误：GLM 看 `body.success==false`+`msg`；MiniMax 看 `base_resp.status_code!=0`+`status_msg`
- 401/403 → 标记 credential 失效（`credentialStatus: expired`）
- 超时 15s，单 key 失败不阻塞其他
- 火山(ark)需 AK/SK、当前 config 无此字段 → **第一期跳过**，返回 `not_configured`
- 配额缓存按 `upstreamId + credentialId` 存最近一次成功结果（失败的保留旧值 + error 标注）

**关于绝对额度**：官方接口只回百分比。GLM 的 1.6亿/5h 是用户提供的常量，用于把 `percentage × limit` 还原成"约 X 亿 / 1.6亿"展示。该常量来自配置（见 4.4）。

### 4.3 扩展 `src/proxy.ts`：新增 `GET /metrics`

合并三大块，一次返回。**鉴权对齐 `/models`**（`extractClientApiKey` + `authenticateRequest`），不复用 pool-status 的裸奔模式。响应 schema 见 §7。

启动时初始化 `MetricsCollector` 与 `QuotaFetcher`（后者设 60s `setInterval`），随 `createProxyServer(ctx)` 注入。

### 4.4 `proxy-config.json` 扩展（可选字段）

`UpstreamConfig` 新增可选 `quotaLimits`，用于绝对值展示（不填则只显示百分比）：
```jsonc
"glm": {
  "baseURL": "https://open.bigmodel.cn/api/paas/v4",
  "codePlanCredentials": [...],
  "quotaLimits": { "fiveHourTokens": 160000000 }   // 可选
}
```
`QuotaFetcher` 自动探测：仅对 `baseURL` 命中 GLM/MiniMax 域名、且存在 `codePlanCredentials` 的 upstream 发起查询，无需额外开关。

### 4.5 埋点位置

`proxy.ts` 的 `handleRequest`（约 873-943 行）在每次请求**结束**时（无论成功/失败/冷却兜底）调用 `ctx.metrics.record({...})`：
- `credentialId` = 最终命中的 credential（即 `usageExtra.routing_key` 的来源 `pickedCredentialId`）
- `success` = 上游返回 2xx 为 true，429/5xx/网络错误为 false
- token 取自上游响应（`message_start`/`message_delta`，复用 `usageLogger` 已有的解析）
- `costMs` = 响应结束时间 - 请求开始时间

---

## 5. CrewCentral 后端改动

新增 `backend/app/api/routes/gateway_admin.py`（参照 `models_admin.py` 范式）：
- `GET /admin/gateway/metrics`：转发到 `{crew_proxy_url}/metrics`，带 `Authorization: Bearer {crew_proxy_api_key}`，超时 10s，原样套 `RcResponse` 信封返回
- ACL：admin 权限（与 `models_admin` 一致）
- 网关不可达：返回 `rc!=0` + 错误信息（前端据此显示离线横幅）

在 `backend/app/api/routes` 的路由注册处挂载该 router。

---

## 6. CrewCentral 前端改动

### 6.1 文件结构
- `frontend/src/lib/gateway-api.ts`：`fetchGatewayMetrics()`（照 `models-api.ts` 模式）
- `frontend/src/pages/admin/GatewayDashboardPage.tsx`：大屏主页（默认导出）
- `frontend/src/components/gateway/`：大屏子组件（KpiBar、ProviderCard、PoolLoadChart、QuotaCard、TrendChart、TokenRateChart）
- `frontend/src/lib/echarts.ts`：echarts 浅色主题注册（调色板对齐 Tailwind）
- `App.tsx`：加两条路由
  - `/admin/gateway` → admin 后台内，套 `AdminLayout`（带导航 + 权限）
  - `/dashboard/gateway` → 全屏，无 `AdminLayout`（投屏/挂墙用）
- `TopNavBar.tsx`：admin 菜单加入口
- 依赖：`npm i echarts`

### 6.2 信息架构（自上而下 6 模块）

| # | 模块 | 内容 |
|---|---|---|
| 1 | **顶部 KPI 条** | 总请求/min、总成功率、总 token/min、活跃 provider、异常 provider、网关延迟。网关离线 → 红色横幅 + 最后数据时间 |
| 2 | **Provider 卡片行** | 每个 provider 一张：健康灯、近 5min 成功率/调用数/耗时、mini 配额条；`down` 时整张卡标红 |
| 3 | **池子负载条形图** | 横向条形：每个 credential 近 1h 调用次数，按 provider 分组；**冷却中的 key 整条变红/橙** |
| 4 | **配额详情区** | GLM/MiniMax 每个 key：5h 进度环 + 剩余% + 重置倒计时 + 绝对值(56M/160M)；周配额次行 |
| 5 | **调用趋势折线** | 近 1h 调用数(柱) + 成功率(折线) 双轴，按 provider 切换 |
| 6 | **token 速率** | 各 provider token/min 堆叠面积 |

### 6.3 视觉风格：浅色 dashboard
跟随 CrewCentral 现有 admin 的浅色 Tailwind 风格，与其它 admin 页一致；echarts 注册一套浅色主题，调色板对齐 Tailwind 中性色 + 强调色。不引入深色皮肤。

### 6.4 配色与健康语义

| 状态 | 颜色 | 触发 |
|---|---|---|
| healthy | 绿 | 正常 |
| degraded | 黄/橙 | 部分凭证冷却 **或** 5min 成功率 < 90% |
| **down** | 红 | **全池冷却** |
| 凭证冷却中 | 红（quota）/ 橙（rate_limit / network） | `inCooldown=true`，颜色随 `cooldownReason`（条形图整条变色） |
| 配额 >80% | 橙 | `usedPct>80` |
| 配额 >95% | 红 | `usedPct>95` |

`health` 由网关侧算好返回（前端只渲染）：
- `down`：该 provider 所有 credential `inCooldown=true`
- `degraded`：部分冷却，或最近 5min `successRate < 0.9`
- `healthy`：其余

### 6.5 刷新机制
- 前端 `setInterval` **每 3s** 拉一次 `GET /api/v1/admin/gateway/metrics`
- 请求重叠保护（上次未返回则跳过本轮）
- `document.visibilitychange`：页面不可见时暂停轮询
- 配额区块用网关 60s 缓存值，前端不更频繁触发

---

## 7. 数据模型

### `/metrics` 响应 schema
```jsonc
{
  "ts": 1751800000,
  "gatewayOnline": true,
  "totals": {
    "last1m": { "count": 12, "success": 11, "fail": 1, "successRate": 0.917,
                "inputTokens": 1234, "outputTokens": 5678, "avgCostMs": 2300 },
    "last5m": { /* 同上 */ },
    "last1h": { /* 同上 */ }
  },
  "providers": [{
    "upstreamId": "glm",
    "provider": "zai",
    "model": "glm-5.2",
    "health": "healthy",            // healthy | degraded | down
    "stats": { "last1m": {…}, "last5m": {…}, "last1h": {…} },
    "credentials": [{
      "id": "glm-key1",
      "inCooldown": true,
      "cooldownUntil": 1751800600,
      "cooldownReason": "quota",    // quota | rate_limit | network
      "inFlight": 0,
      "requestsLast1h": 120,
      "quota": {
        "fiveHour": { "usedPct": 35, "usedTokens": 56000000,
                      "limitTokens": 160000000, "resetsAt": "2026-07-07T10:00:00Z" },
        "weekly":   { "usedPct": 20, "resetsAt": "2026-07-09T00:00:00Z" }
      },
      "quotaStatus": "ok"           // ok | expired | not_configured | error
    }]
  }]
}
```

- `provider` 字段（值固定，前端用于选图标/文案）：GLM=`glm`，MiniMax=`minimax`，其余 = upstreamId（如 `ark`/`deepseek`/`gpt`/`claude`）
- `limitTokens` 来自 `quotaLimits` 配置，无则 `null`
- 无配额查询的 provider（ark/deepseek/gpt/claude），`credentials[].quota = null`

---

## 8. 错误处理与降级

| 场景 | 行为 |
|---|---|
| 网关超时/离线 | 顶部红横幅 + 保留最后一次成功数据 + 时间戳；前端 30s 退避重试 |
| 单 provider 配额查询失败 | 该 credential 配额卡显示"查询失败"+error，不阻塞其他模块；保留上次成功值 |
| 配额接口 401/403 | `quotaStatus=expired`，卡片标注"key 失效" |
| 火山/未配置 AK/SK | `quotaStatus=not_configured`，卡片显示"未配置"或隐藏 |
| echarts 未加载/渲染失败 | fallback 到纯文本数字展示 |
| 埋点异常 | `MetricsCollector.record` 内部 try/catch，绝不影响代理主路径 |

---

## 9. 测试策略

### CrewProxy（新增 `test/metrics.test.ts`、`test/quotaFetcher.test.ts`）
- `MetricsCollector`：桶聚合正确性（多窗口、跨桶、成功率边界、token 累加）、内存清理
- `QuotaFetcher`：**直接翻译 cc-switch 的 30+ 单测用例**（GLM `unit==3/6` 分类、5h/周双桶、缺失字段兜底、MiniMax `general` 定位/video 跳过、`weekly_status==3` 跳过周桶、负数/超 100 透传等）
- `/metrics` 端点：鉴权（无 key 401、错 key 401、对 key 200）、响应结构
- 埋点：成功/失败/429 三条路径都计数

### CrewCentral
- 后端 `gateway_admin.py`：转发成功、网关超时降级、鉴权（非 admin 拒绝）
- 前端：`GatewayDashboardPage` 渲染（mock metrics 数据）、冷却配色映射、离线横幅

---

## 10. 非目标 / 未来扩展

- **火山(ark)配额查询**：需 AK/SK（与推理 key 两套凭据），第一期跳过，留 `not_configured` 占位
- **历史回看 / 长期趋势**：当前仅近 1h 实时；未来可接 ES（`woicrew-usage`）做天/周级趋势
- **告警 / 通知**（如全池冷却、配额耗尽推送）：不在本期
- **写操作**：大屏只读，不提供任何配置/控制能力
- **`/pool-status` 加鉴权**：既有裸奔问题，不在本次范围（但 `/metrics` 会带鉴权）

---

## 11. 实现备注

- `/metrics` 鉴权**复用 `proxy.ts` 中 `/models` 的 `extractClientApiKey` + `authenticateRequest`**，CrewCentral 后端用现有 `crew_proxy_api_key` 作为 `Authorization: Bearer`。实现时先读 `proxy.ts` 的 `extractClientApiKey`/`authenticateRequest` 与 `models_admin.py` 的调用方式，保持一致。
- `QuotaFetcher` 的 GLM/MiniMax 解析逻辑以 `cc-switch/src-tauri/src/services/coding_plan.rs`（`query_zhipu`、`query_minimax`、`parse_zhipu_token_tiers`、`parse_minimax_tiers` 及其 `#[cfg(test)]` 用例）为唯一参考来源，翻译成 TS。
- 埋点 token 解析复用 `src/usageLogger.ts` 已有的 `input_tokens/output_tokens` 提取，避免重复实现。
- 浅色 echarts 主题调色板需与 CrewCentral 现有 Tailwind 配色协调（实现时参照 `tailwind.config.js` 的色板）。
