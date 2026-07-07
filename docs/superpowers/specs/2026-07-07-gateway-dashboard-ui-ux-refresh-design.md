# 网关监控页面 UI/UX 优化设计

- **日期**: 2026-07-07
- **状态**: Approved design（待用户复核文档）
- **范围**: CrewCentral 前端网关监控页面 UI/UX 优化
- **作者**: Carlzzz / Claude

---

## 1. 背景与目标

当前网关监控页面已经能展示全局 KPI、Provider 卡片、池子负载、配额详情、调用趋势和 token 速率。但信息结构较分散：GLM / MiniMax 的 token 池配额在独立配额区展示，池子调用负载又在独立图表展示，用户需要在多个区域之间来回对应；GLM 多 token 池时也容易被理解成多张监控卡片。

本次优化目标是把 GLM 与 MiniMax 的池子负载、配额使用和 Provider 健康状态融合到上方模型配额卡片中，让两个核心 coding plan provider 以同一行两张增强卡呈现；底部独立配额详情合并进上方；调用趋势图改成更清晰的主趋势 + 健康小面板结构。

### 成功标准

- GLM 只显示一张增强监控卡，卡片内包含所有 token pools。
- MiniMax 只显示一张增强监控卡，卡片内包含所有 token pools。
- GLM / MiniMax 两张增强卡在宽屏下同一行展示，各自有差异化但协调的视觉风格。
- 每个 token pool 都能看到 5h 配额条、周配额、近 1h 调用条、inFlight、冷却/失效/错误状态。
- 页面不再出现独立的底部“配额（5h / 周）”详情区。
- 池子负载融入增强卡，不再要求用户跨图表对应 credential。
- 调用趋势图避免双 y 轴混读，改为主调用吞吐趋势 + 右侧成功率/token 小面板。
- 现有 `/metrics` 数据合约不变，后端和 CrewProxy 不需要改动。

---

## 2. 现状分析

当前相关前端文件：

- `frontend/src/pages/admin/GatewayDashboardPage.tsx`：页面骨架，按 KPI、Provider 卡、池子负载、配额详情、趋势图、token 图顺序堆叠。
- `frontend/src/components/gateway/ProviderCard.tsx`：普通 Provider 卡片，只展示一个代表性 5h 配额 mini bar。
- `frontend/src/components/gateway/QuotaGrid.tsx`：独立配额详情区，逐 credential 展示 5h / 周配额。
- `frontend/src/components/gateway/PoolLoadChart.tsx`：独立横向条形图，逐 credential 展示近 1h 调用次数。
- `frontend/src/components/gateway/TrendChart.tsx`：调用数柱 + 成功率线的双 y 轴组合图。
- `frontend/src/components/gateway/TokenRateChart.tsx`：独立 token 输入/输出堆叠面积图。
- `frontend/src/hooks/useGatewayMetrics.ts`：每 3s 拉取 metrics，并维护近 120 个采样的前端 history。
- `frontend/src/lib/gateway-api.ts`：`GatewayMetrics`、`GatewayProvider`、`GatewayCredential` 等类型。

现有设计问题：

1. **配额和负载割裂**：同一个 token pool 的 5h 配额、周配额、近 1h 调用、冷却状态分散在不同区域。
2. **GLM / MiniMax 重点不突出**：它们是 coding plan 配额核心对象，却和其它 provider 使用同等层级展示。
3. **页面纵向过长**：独立 PoolLoadChart、QuotaGrid、TrendChart、TokenRateChart 堆叠后信息密度高但阅读路径长。
4. **趋势图双轴混读**：调用数和成功率不是同一尺度，放在双 y 轴里容易产生错误关联。
5. **视觉识别弱**：GLM 与 MiniMax 没有自己的 provider 视觉身份，用户扫视时不够快。

---

## 3. 设计方案总览

采用已确认的方案 A：**GLM / MiniMax 双旗舰增强卡 + 其它 Provider 普通小卡**。

页面结构调整为：

1. 顶部全局 KPI 条：保留现有 `KpiBar`。
2. GLM / MiniMax 增强卡区：新增两张 quota hero card，宽屏同一行。
3. 其它 Provider 普通卡区：继续使用 `ProviderCard`。
4. 趋势区：重构为主调用吞吐趋势 + 右侧成功率/token 小面板。

不再在页面中挂载独立的 `QuotaGrid`、`PoolLoadChart`、`TokenRateChart`。

---

## 4. 信息架构

### 4.1 顶部 KPI 条

`KpiBar` 继续回答“整个网关是否正常”。展示：

- 请求 / 分钟
- 成功率 5min
- Token / 分钟
- 活跃 Provider
- 异常 Provider
- 网关离线/加载失败横幅

该区域不承担单 provider 配额细节。

### 4.2 GLM / MiniMax 双旗舰增强卡

新增组件建议命名：`QuotaProviderHeroCard.tsx`。

每张卡对应一个 provider，但包含该 provider 的所有 token pools。卡片内容包括：

- Provider 名称、模型、健康状态、token pool 数量
- 单 provider 的 5min 成功率、5min 调用数、平均耗时、Token / min
- 每个 credential/token pool 的配额和负载行
- 状态摘要文案

GLM 与 MiniMax 在宽屏下使用 `grid-cols-2` 同一行展示；中窄屏自然换为单列。

### 4.3 其它 Provider 普通卡

除 GLM / MiniMax 外，其它 provider 继续用 `ProviderCard`。这些卡片排在增强卡下方，作为补充状态区。

这样不会因为优化 GLM / MiniMax 而丢失其它 provider 的健康状态。

### 4.4 趋势区

`TrendChart` 重构为新布局：

- 左侧主图：调用吞吐趋势，单 y 轴。
- 右侧上面板：成功率大数字 + sparkline / 状态说明。
- 右侧下面板：Token / min 大数字 + 输入/输出占比条 + 小趋势。

成功率和 token 信息可以出现在主图 tooltip 中，但不再作为主图坐标轴绘制。

---

## 5. GLM / MiniMax 增强卡设计

### 5.1 Provider 视觉主题

两张增强卡保持 CrewCentral 现有浅色后台风格，但做轻微差异化：

| Provider | 主色 | 背景 | 边框 | 语义 |
|---|---|---|---|---|
| GLM | sky / cyan | 白底 + 淡蓝渐变 | sky-200 / cyan-200 | 高速通道、流量计 |
| MiniMax | violet / indigo | 白底 + 淡紫渐变 | violet-200 / indigo-200 | 模型池、调度舱 |

卡片顶部可以加一条轻量“信号轨道”装饰线，表达网关流量与 token pool 调度。这是本次设计的唯一记忆点，其它视觉元素保持克制。

### 5.2 Header 区

左侧：

- Provider 显示名：`GLM` / `MiniMax`
- model 名称
- `N 个 token 池`

右侧：

- 健康状态 pill：健康 / 降级 / 异常
- 若存在冷却池子：`N 个池子冷却`
- 若存在高配额：`N 个池子 >80%`

### 5.3 Metrics Strip

每张卡展示 4 个小指标：

- 成功率 5min
- 调用 5min
- 平均耗时
- Token / min

Token / min 使用 `stats.last1m.inputTokens + stats.last1m.outputTokens`。

### 5.4 Pool Rows

每个 credential/token pool 一行，不再使用小卡片矩阵，避免 GLM 多池时视觉爆炸。

每行结构：

左侧：

- credential id，中间或末尾截断
- 状态标签：正常 / 冷却中 / key 失效 / 查询失败 / 未配置配额 / 预估

中间：

- 5h 配额进度条
- 条下方文字：`已用 56.0M / 160.0M · 重置还剩 2h 14m`
- 若 `limitTokens` 为 null，展示 `已用 56.0% · 重置还剩 2h 14m`

右侧：

- 近 1h 调用条，按同 provider 内最大 `requestsLast1h` 归一化
- `inFlight` 数字
- 周配额 badge：`周 24.1%`

### 5.5 状态文案

卡片底部根据派生状态展示一句短文案：

- 全部正常：`所有 token 池可用，配额分布均衡`
- 部分冷却：`部分池子处于冷却，流量会自动绕行`
- 高配额：`有池子接近 5h 限额，注意短时突增`
- 查询失败：`配额查询失败，保留最近调用负载`
- 全部异常：`所有池子不可用，请检查上游凭证或配额`

---

## 6. 数据派生规则

### 6.1 Provider 识别

GLM / MiniMax 识别需大小写不敏感，并同时考虑 `upstreamId`、`provider`、`model`：

```ts
const providerKey = `${provider.upstreamId} ${provider.provider} ${provider.model}`.toLowerCase();
const isGlm = providerKey.includes("glm") || providerKey.includes("zai") || providerKey.includes("bigmodel");
const isMinimax = providerKey.includes("minimax");
```

渲染顺序固定：

1. GLM
2. MiniMax
3. 其它 provider

如果某一家不存在，只渲染存在的增强卡；不展示空占位。

### 6.2 增强卡派生值

每张增强卡内部计算：

- `credentialCount`
- `cooldownCount`
- `expiredCount`
- `quotaErrorCount`
- `highQuotaCount`：`fiveHour.usedPct >= 80`
- `criticalQuotaCount`：`fiveHour.usedPct >= 95`
- `maxRequestsLast1h`：用于池子调用条归一化

不再使用 `ProviderCard` 的“取第一个 ok credential 作为代表性配额”的逻辑；增强卡内每个池子显示自己的配额。

### 6.3 池子状态优先级

每个 token pool 的状态按以下优先级显示：

1. `quotaStatus === "expired"` → `key 失效`
2. `quotaStatus === "error"` → `查询失败`
3. `inCooldown === true` → `冷却中`
4. `quotaStatus === "not_configured"` → `未配置配额`
5. `quotaStatus === "ok"` → `正常`

卡片总体健康仍以 `provider.health` 为准，但辅助提示结合高配额、冷却、错误等派生值。

---

## 7. 数据可视化规则

### 7.1 配额进度条

5h 配额条表示 magnitude，颜色按阈值：

- `< 80%`：provider 主色
- `80%–95%`：amber
- `>= 95%`：rose

条形旁必须显示百分比和文本数值，避免只靠颜色传达状态。

### 7.2 近 1h 调用条

近 1h 调用条表示同 provider 内 token pool 相对负载：

- 宽度 = `requestsLast1h / maxRequestsLast1h`
- 正常状态使用 provider 主色浅色变体
- 冷却中覆盖为状态色：
  - `cooldownReason === "quota"` → rose
  - `rate_limit` / `network` → orange

### 7.3 趋势图

主趋势图只使用一个 y 轴，表达调用吞吐：

- x 轴：history 采样时间
- y 轴：调用数
- series：浅色 bar 表示采样节奏，主色 smooth line + area 表示趋势
- tooltip：展示时间、调用数、成功率、input/output tokens

成功率不再画在主图第二 y 轴上，而在右侧小面板展示。

### 7.4 成功率小面板

成功率小面板展示：

- 当前成功率大数字：`history.at(-1).successRate * 100`
- 小型 sparkline
- 状态色：
  - `>= 95%`：emerald
  - `90%–95%`：amber
  - `< 90%`：rose
- 状态文案：稳定 / 失败率升高 / 需要检查

### 7.5 Token 小面板

Token 小面板展示：

- 当前 token/min：`inputTokens + outputTokens`
- 输入/输出水平堆叠条
- `输入 X · 输出 Y` 文本
- 小型趋势线或 mini bars

---

## 8. 颜色与可访问性

当前图表色板：

- sky `#0ea5e9`
- violet `#8b5cf6`
- amber `#f59e0b`
- emerald `#10b981`
- rose `#f43f5e`
- indigo `#4f46e5`
- orange `#f97316`

已用 dataviz 校验脚本检查浅色模式色板，CVD 分离通过。部分颜色在白底对比度低于 3:1，因此：

- 不把这些颜色作为正文文字颜色。
- 文本使用 slate 系列或状态深色变体。
- 图形 mark 保留直接数值标签、tooltip 和文字状态。
- 状态不只靠颜色表达，必须配合文字标签。

---

## 9. 组件与文件计划

### 新增

- `frontend/src/components/gateway/QuotaProviderHeroCard.tsx`
  - GLM / MiniMax 增强卡。
- 可选：`frontend/src/components/gateway/gateway-ui.ts`
  - provider 识别、主题、formatTokens、formatCountdown、quota tone 等纯函数。

### 修改

- `frontend/src/pages/admin/GatewayDashboardPage.tsx`
  - 拆分 `quotaHeroProviders` / `otherProviders`。
  - 渲染 GLM / MiniMax 增强卡区。
  - 不再挂载 `QuotaGrid`、`PoolLoadChart`、`TokenRateChart`。
  - 保留其它 provider 普通卡。
- `frontend/src/components/gateway/TrendChart.tsx`
  - 重构为主趋势 + 右侧成功率/token 小面板。
- `frontend/src/components/gateway/ProviderCard.tsx`
  - 保持普通 provider 卡用途；必要时做小幅样式协调。

### 暂不删除

第一版不立即删除旧文件，降低风险：

- `QuotaGrid.tsx`
- `PoolLoadChart.tsx`
- `TokenRateChart.tsx`

它们会从页面中移除引用。构建与页面验证通过后，再单独决定是否清理未使用组件。

---

## 10. 响应式设计

- `xl` 以上：GLM / MiniMax 两张增强卡同一行，各占 50%。
- `md/lg`：优先两列；空间不足时自然换行。
- mobile：增强卡单列；pool row 改为上下布局，配额条、调用条、周配额分两行展示。
- 池子数量较多时第一版自然撑高，不做内部滚动，避免隐藏关键配额状态。

---

## 11. 错误与空状态

| 场景 | 展示 |
|---|---|
| GLM 不存在 | 不展示 GLM 增强卡，不占空位 |
| MiniMax 不存在 | 不展示 MiniMax 增强卡，不占空位 |
| provider 无 credentials | 卡片显示“暂无 token 池数据” |
| `quotaStatus=expired` | pool row 显示 `key 失效`，状态色 rose |
| `quotaStatus=error` | pool row 显示 `查询失败` 和 `quotaError`，状态色 amber |
| `quotaStatus=not_configured` | pool row 显示 `未配置配额`，保留调用负载 |
| 无 history | 趋势区显示 `暂无数据` 占位 |
| 网关离线 | 顶部 KPI 继续显示离线横幅，并保留最后一次成功数据 |

---

## 12. 验证策略

实现后运行：

```bash
cd frontend
npx tsc -b
npx vite build
```

浏览器手动验证：

1. `/admin/gateway` 能加载。
2. 顶部 KPI 正常。
3. GLM 只出现一张增强卡，内部包含所有 token pools。
4. MiniMax 只出现一张增强卡，内部包含所有 token pools。
5. 每个池子显示 5h 配额条、周配额、近 1h 调用条、inFlight 和状态。
6. 页面不再出现独立“配额（5h / 周）”详情区。
7. 页面不再出现独立 token 速率大图。
8. 趋势区为主趋势 + 右侧成功率/token 小面板。
9. 宽屏下 GLM / MiniMax 同一行；窄屏下不溢出。
10. 冷却、失效、查询失败、高配额等状态都有文字和颜色提示。

---

## 13. 非目标

- 不改 CrewProxy `/metrics` 数据合约。
- 不改 CrewCentral 后端 gateway proxy。
- 不新增长期历史回看、告警、配置写操作。
- 不改变权限模型或路由结构。
- 不在第一版引入新的图表库或 CSS 框架。
- 不立即删除旧图表组件；清理作为后续独立小改动处理。

---

## 14. 已确认的设计决策

- 采用“GLM / MiniMax 双旗舰增强卡 + 其它 provider 普通小卡”。
- GLM / MiniMax 两张增强卡宽屏同一行。
- GLM 和 MiniMax 卡片分别使用淡蓝 / 淡紫视觉主题。
- 配额详情和池子负载合并进增强卡。
- 趋势图采用“主调用吞吐趋势 + 右侧成功率/token 小面板”。
- 避免双 y 轴表达调用数和成功率。
