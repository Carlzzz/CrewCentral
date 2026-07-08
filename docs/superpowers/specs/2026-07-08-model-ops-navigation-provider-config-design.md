# 模型运营导航与 Provider 配置设计

- **日期**: 2026-07-08
- **状态**: Approved design（待用户复核文档）
- **范围**: CrewCentral + CrewProxy 双仓库协同改造
- **作者**: Carlzzz / Claude

---

## 1. 背景与目标

当前 CrewCentral 的“用量分析”和“网关监控”位于顶部导航的“后台管理”菜单下。随着 CrewProxy 网关监控、用量分析、Provider 配置逐步形成完整的模型运营闭环，这两个页面不应继续混在用户、设备、文档等后台管理项中。

本次设计目标：

1. 新增一级菜单 **模型运营**。
2. 将 **用量分析** 和 **网关监控** 从“后台管理”移出，放入“模型运营”。
3. 在“模型运营”下新增 **Provider 配置** 页面。
4. Provider 配置页面支持新增/修改 Provider 与模型映射，保存后 CrewProxy 热加载生效。
5. 优化用量分析 UI，使其与网关监控保持一致的浅色 dashboard 风格。
6. CrewProxy 新增配置管理 API；CrewCentral 只做鉴权代理与管理界面，不直接写 CrewProxy 配置文件。

---

## 2. 已确认决策

- 新一级菜单命名：**模型运营**。
- 模型运营下三页平级：
  - 用量分析
  - 网关监控
  - Provider 配置
- 新路由：
  - `/model-ops/usage`
  - `/model-ops/gateway`
  - `/model-ops/providers`
- 旧路由保留 redirect：
  - `/admin/usage` → `/model-ops/usage`
  - `/admin/gateway` → `/model-ops/gateway`
- Provider 配置必须“保存后生效”。
- Provider 配置需同时管理：
  - CrewProxy `upstreamsById`
  - CrewProxy `models` 映射
- CrewProxy 本地库路径：`C:\Users\zhaocao\Documents\GitHub\CrewProxy`
- 生产服务器路径：`/home/ambilight/CrewProxy`
- 生产真实配置：`/home/ambilight/CrewProxy/proxy-config.json`
- 后续 `proxy-config.json` 加入 CrewProxy `.gitignore`，不随代码同步覆盖。
- 不通过 SSH 做运行时配置写入；配置由 CrewProxy 自己的受保护 API 管理。

---

## 3. 现状分析

### 3.1 CrewCentral 前端

- 顶部导航在 `frontend/src/components/layout/TopNavBar.tsx`。
- 路由在 `frontend/src/App.tsx`。
- 当前 `/admin/usage` 和 `/admin/gateway` 在 `AdminLayout` 下。
- 当前“后台管理”菜单包含：
  - 设备管理
  - 客户端发布
  - 文档管理
  - 用户管理
  - 模型权限
  - 用量分析
  - 网关监控
- 用量分析页面是 `frontend/src/pages/admin/UsageDashboardPage.tsx`。
- 网关监控页面是 `frontend/src/pages/admin/GatewayDashboardPage.tsx`。

### 3.2 CrewCentral 后端

- 当前用量分析 API：`backend/app/api/routes/usage_admin.py`，权限 `usage`。
- 当前网关监控代理 API：`backend/app/api/routes/gateway_admin.py`，权限 `gateway`。
- 当前模型可用列表代理 API：`backend/app/api/routes/models_admin.py`。
- 角色菜单权限在 `backend/app/auth/role_service.py`。

### 3.3 CrewProxy

- 真实配置来自 `proxy-config.json`。
- README 已说明 `proxy-config.json` 保存后约 300ms 内会重新加载；解析失败则保留上一版有效配置。
- 当前已有：
  - `/models`
  - `/metrics`
  - `/v1/messages`
- 当前没有 Provider 配置管理 API。

---

## 4. 导航与权限设计

### 4.1 新一级菜单

顶部导航新增一级菜单：**模型运营**。

菜单项：

| 菜单项 | 路由 | 权限 |
|---|---|---|
| 用量分析 | `/model-ops/usage` | `usage` |
| 网关监控 | `/model-ops/gateway` | `gateway` |
| Provider 配置 | `/model-ops/providers` | `providers.manage` |

模型运营菜单显示条件：

```ts
can("usage") || can("gateway") || can("providers.manage")
```

### 4.2 后台管理菜单调整

从“后台管理”移除：

- 用量分析
- 网关监控

后台管理保留：

- 设备管理
- 客户端发布
- 文档管理
- 用户管理
- 模型权限

### 4.3 路由兼容

新增：

```text
/model-ops/usage
/model-ops/gateway
/model-ops/providers
```

保留旧路由 redirect：

```text
/admin/usage    -> /model-ops/usage
/admin/gateway  -> /model-ops/gateway
```

保留全屏路由：

```text
/dashboard/gateway
```

### 4.4 权限

复用现有：

- `usage`
- `gateway`

新增：

- `providers.manage`：可访问并保存 Provider 配置。

`super_admin` 默认拥有 `providers.manage`。`ops_admin` 建议也默认拥有，因为其当前已有 `usage` 和 `gateway`，属于运维角色。

---

## 5. 用量分析 UI 设计

### 5.1 目标

将当前用量分析页面改成与网关监控一致的“模型运营分析台”风格。保留现有 API 与筛选逻辑，不改变 ES 查询语义。

### 5.2 视觉语言

与网关监控一致：

- 页面背景：`bg-slate-50`
- 容器宽度：`max-w-7xl` 或 `max-w-[1600px]`
- 卡片：`rounded-2xl border border-slate-200 bg-white shadow-sm`
- KPI：浅色状态卡
- 图表色彩：
  - sky：输入 tokens / 总趋势
  - violet：输出 tokens / 模型维度
  - emerald：健康 / 成功
  - amber：观察 / 高消耗
  - rose：异常 / 失败
- 文本仍使用 slate 系列，不用浅色 series 色做正文。

### 5.3 页面结构

#### 第一层：Header + 筛选器

- 标题：`用量分析`
- 副标题：`按用户、模型和时间窗口追踪 CrewProxy 调用与 Token 消耗`
- 右侧：刷新时间 / 查询状态
- 筛选器卡片：
  - 时间范围：今日、近 7 天、近 30 天、自定义
  - 用户多选
  - 模型多选
  - session_id 搜索
  - 重置按钮

#### 第二层：KPI 总览

五个 KPI：

1. 总调用：`overview.total_calls`
2. 输入 Tokens：`overview.total_input_tokens`，sub 显示缓存命中 `total_cached_tokens`
3. 输出 Tokens：`overview.total_output_tokens`
4. 总 Tokens：input + output
5. 缓存命中率：`total_cached_tokens / total_input_tokens`

#### 第三层：趋势 + 小面板

避免双 y 轴。

左侧主图：Token 消耗趋势

- x：日期
- y：tokens
- input/output 使用 stacked area 或 stacked bar
- tooltip 显示日期、输入、输出、总 tokens、调用次数

右侧小面板：

1. 调用次数：大数字 + calls sparkline
2. 日均 Tokens：大数字 + total token sparkline

#### 第四层：模型 / 用户 / 明细

模型分布：

- 横向条形图
- 每个 model 一行
- input/output stacked bar
- 右侧显示调用次数

用户分布：

- 横向条形图
- 每个 user 一行
- input/output stacked bar
- 右侧显示调用次数

明细记录：

- 卡片式 table container
- sticky header
- columns：时间、用户、模型、输入、输出、缓存、耗时、routing_key、session
- 长文本 input/output 默认折叠，不在表格中展开。

### 5.4 图表规则

- 不使用双 y 轴。
- Token 趋势和调用次数分开显示。
- input/output 颜色固定。
- ≥2 个系列必须有 legend 或直接标签。
- hover tooltip 显示原始值。
- 空状态要说明原因，例如：`这段时间暂无用量记录，请调整时间范围或筛选条件`。

---

## 6. Provider 配置页面设计

### 6.1 页面目标

在 CrewCentral 中通过可视化表单管理 CrewProxy Provider 配置，支持新增 Provider 与模型映射，保存后 CrewProxy 热加载生效。

### 6.2 页面结构

```text
模型运营 / Provider 配置

[状态条：配置来源 / CrewProxy 连接 / 最近保存 / 生效状态]

┌ Provider 列表 ┐ ┌ Provider 编辑表单 ┐
│ glm            │ │ upstreamId         │
│ minimax        │ │ provider           │
│ deepseek       │ │ baseURL            │
│ + 新增         │ │ apiKey             │
└───────────────┘ │ token pools         │
                  │ quotaLimits         │
                  └─────────────────────┘

┌ 模型映射 ┐
│ glm-5.2 -> glm / glm-5.2             │
│ minimax-m1 -> minimax / MiniMax-M1   │
└──────────────────────────────────────┘
```

### 6.3 顶部状态条

显示：

- 配置来源：CrewProxy config API
- 当前配置路径：由 CrewProxy 返回，例如 `/home/ambilight/CrewProxy/proxy-config.json`
- CrewProxy 连接：在线 / 不可达
- 最近保存时间
- 生效状态：已生效 / 等待热加载 / 校验失败

### 6.4 Provider 列表

每项显示：

- upstreamId
- provider 类型
- baseURL 域名
- token pool 数
- 状态：启用 / 缺 key / 配置不完整

操作：

- 新增 Provider
- 复制 Provider（不复制 key）
- 删除 Provider
- 启用/禁用（如果 CrewProxy config 支持 enabled；若不支持，第一版通过保留/删除控制）

### 6.5 Provider 编辑表单

字段：

- `upstreamId`
  - 必填
  - `^[a-zA-Z0-9_-]+$`
- `provider`
  - 下拉：`glm / minimax / openai / deepseek / claude / gemini / ark / custom`
- `baseURL`
  - 必填
  - URL 校验
- `apiKey`
  - 不回显完整 key
  - 支持 keep/replace
- `model`
  - 默认上游模型
- `codePlanCredentials`
  - 多行 token pool
  - 字段：id / apiKey / weight / enabled
- `quotaLimits`
  - `fiveHourTokens`

### 6.6 模型映射

同页管理 CrewProxy `models`：

- 展示模型名：如 `glm-5.2`
- upstream：选择已有 Provider
- upstream model：实际发给上游的 model

保存 Provider 时，如果填写了默认 model，前端提示是否同时新增模型映射。

### 6.7 密钥处理

- GET 配置只返回脱敏 key：
  - `hasApiKey`
  - `apiKeyMasked`
- 前端不保存 masked key。
- 保存时：
  - 未替换：`apiKeyMode: "keep"`
  - 替换：`apiKeyMode: "replace"` + 新 key
- `codePlanCredentials` 同理。
- 日志、错误信息不得包含完整 key。

---

## 7. CrewProxy 配置管理 API

### 7.1 API 列表

CrewProxy 新增：

```text
GET  /admin/config
POST /admin/config/validate
PUT  /admin/config
GET  /admin/config/effective
```

鉴权：复用 `/models`、`/metrics` 的 `x-api-key` / `Authorization: Bearer` 鉴权。`WOICLAW_AUTH_BYPASS=1` 时本地开发可绕过。

### 7.2 `GET /admin/config`

读取当前 `proxy-config.json`，返回脱敏配置。

返回字段：

- `configPath`
- `defaultUpstream`
- `upstreamsById`
- `models`
- `updatedAt`

密钥字段只返回 masked/hasKey，不返回完整 key。

### 7.3 `POST /admin/config/validate`

只校验，不保存。

返回：

```json
{
  "ok": true,
  "errors": [],
  "warnings": []
}
```

校验规则：

- 至少有一个 upstream。
- upstreamId 符合 `^[a-zA-Z0-9_-]+$`。
- baseURL 是 URL。
- provider 在允许值内，custom 允许自由值。
- models 引用的 upstream 必须存在。
- models.*.model 必填。
- 同一 upstream 内 codePlanCredentials[].id 唯一。
- weight 为正数。
- quotaLimits.fiveHourTokens 为正整数。

### 7.4 `PUT /admin/config`

保存配置并触发 CrewProxy 热加载。

请求体使用脱敏编辑模型，支持：

- `apiKeyMode: "keep"`
- `apiKeyMode: "replace"`

保存流程：

1. 读取当前原始 config。
2. 将 keep 模式恢复为原始真实 key。
3. 将 replace 模式写入新 key。
4. 校验完整真实 config。
5. 写临时文件 `proxy-config.json.tmp`。
6. 原子替换原文件。
7. 返回保存结果。
8. 现有 watcher 约 300ms 内 reload。

校验失败时不写文件。

### 7.5 `GET /admin/config/effective`

返回当前运行时有效配置摘要：

- defaultUpstream
- upstream 列表
  - upstreamId
  - provider
  - model
  - baseURL
  - credentialCount
  - enabledCredentialCount
- models 列表
  - model
  - upstream
  - upstreamModel
- loadedAt

CrewCentral 保存后轮询该接口，判断新配置是否生效。

### 7.6 CrewProxy 模块拆分

新增：

- `src/configRedaction.ts`
  - `maskSecret`
  - `redactProxyConfig`
- `src/configValidation.ts`
  - `validateProxyConfigDraft`
  - `validateResolvedProxyConfig`
- `src/configAdmin.ts`
  - 处理 `/admin/config*` HTTP 请求
  - 合并 keep/replace 密钥
  - 原子写入

修改：

- `src/proxy.ts` 或当前 HTTP 路由入口
  - 挂载配置管理 API。
- `.gitignore`
  - 加入 `proxy-config.json`。

---

## 8. CrewCentral 后端代理 API

新增：`backend/app/api/routes/model_ops_admin.py`

API：

```text
GET  /admin/model-ops/providers/config
POST /admin/model-ops/providers/validate
PUT  /admin/model-ops/providers/config
GET  /admin/model-ops/providers/effective
```

职责：

- `require_session_permission("providers.manage")`
- 使用 `crew_proxy_url` 调 CrewProxy `/admin/config*`
- 使用 `crew_proxy_api_key` 设置 `Authorization: Bearer ...`
- 原样转发 validation errors/warnings
- CrewProxy 不可达时返回明确错误

---

## 9. CrewCentral 前端 API 与页面

新增：

- `frontend/src/lib/model-ops-api.ts`
- `frontend/src/pages/modelops/ProviderConfigPage.tsx`

`model-ops-api.ts` 提供：

- `fetchProviderConfig`
- `validateProviderConfig`
- `saveProviderConfig`
- `fetchProviderEffectiveConfig`

`ProviderConfigPage` 提供：

- Provider 列表
- Provider 编辑表单
- codePlanCredentials 编辑
- quotaLimits 编辑
- models 映射编辑
- 保存前 validate
- 保存后轮询 effective
- key keep/replace 交互

---

## 10. 安全策略

### CrewProxy

- 未鉴权不能读写配置。
- GET 不泄漏完整密钥。
- PUT keep 保留原密钥。
- PUT replace 替换密钥。
- 校验失败不写文件。
- 日志不打印完整密钥。
- 临时文件写入失败时原配置仍在。

### CrewCentral

- 只有 `providers.manage` 能访问 Provider 配置 API。
- `usage` / `gateway` 不能保存 Provider 配置。
- CrewProxy 401/403 时显示 `crew_proxy_api_key` 配置错误。
- 前端不把 masked key 当真实 key 提交。

---

## 11. 交付切片

### Slice 1：导航重组

- 新增“模型运营”一级菜单。
- 移动用量分析/网关监控。
- 新增 Provider 配置入口。
- 保留旧路由 redirect。
- 新增 `providers.manage` 权限。

### Slice 2：用量分析 UI 统一风格

- 保留现有 usage API。
- 重组 `UsageDashboardPage`：Header/筛选器、KPI、Token 趋势、小面板、模型/用户分布、明细表。
- 去掉双 y 轴。
- 对齐网关监控风格。

### Slice 3：CrewProxy 配置管理 API

- 新增 `/admin/config*`。
- 脱敏、校验、keep/replace、原子写入。
- `proxy-config.json` 加 gitignore。
- 单元测试覆盖校验和安全。

### Slice 4：CrewCentral Provider 配置页 + 后端代理

- 后端新增 `model_ops_admin.py`。
- 前端新增 Provider 配置页。
- 保存后轮询 effective。
- 端到端验证新增 Provider + model mapping 生效。

---

## 12. 测试策略

### CrewProxy

- `configValidation` 单测：
  - invalid URL
  - missing upstream
  - duplicate credential id
  - invalid weight
  - invalid quota limit
- `configRedaction` 单测：
  - GET 不返回完整 key
  - mask 结果保留尾部识别
- `configAdmin` 单测：
  - 401 without key
  - GET redacted config
  - PUT keep retains key
  - PUT replace writes new key
  - validate failure does not write file
  - effective returns runtime summary

### CrewCentral 后端

- `model_ops_admin.py` 转发成功。
- CrewProxy 不可达返回错误。
- 非 `providers.manage` 权限拒绝。
- 401/403 明确提示。

### CrewCentral 前端

- 纯函数测试：
  - usage KPI 汇总
  - cache hit rate
  - trend 数据转换
  - provider config draft keep/replace 转换
- `cd frontend && npx tsc -b`
- `cd frontend && npx vite build`
- 浏览器验证：
  - `/model-ops/usage`
  - `/model-ops/gateway`
  - `/model-ops/providers`

---

## 13. 部署策略

### CrewProxy

- 同步代码到服务器 `/home/ambilight/CrewProxy`。
- 确认 `proxy-config.json` 在服务器存在且不被 git 覆盖。
- 确认运行用户可读写 `proxy-config.json`。
- 重启 CrewProxy 以加载新增配置 API。

### CrewCentral

继续使用：

```env
CREW_PROXY_URL=http://localhost:3456
CREW_PROXY_API_KEY=...
```

CrewCentral 不需要知道 `proxy-config.json` 文件路径。

### Nginx

无需直接暴露 CrewProxy 配置 API。浏览器只访问 CrewCentral：

```text
/woicrew/api/v1/admin/model-ops/providers/*
```

---

## 14. 非目标

本次不做：

- Provider 配置审批流
- 配置版本历史/回滚
- 多环境发布
- SSH 写配置
- 直接暴露 CrewProxy 配置接口到公网
- 用量分析后端 ES 查询重构
- 成本金额统计
- 告警通知

---

## 15. 成功标准

- 顶部出现“模型运营”一级菜单。
- 用量分析、网关监控从“后台管理”移出。
- `/model-ops/usage`、`/model-ops/gateway`、`/model-ops/providers` 可按权限访问。
- 旧 `/admin/usage`、`/admin/gateway` 自动跳转到新路由。
- 用量分析 UI 与网关监控风格一致，且不再使用双 y 轴。
- CrewProxy 提供受保护的配置 API。
- Provider 配置页可读取脱敏配置。
- 新增 Provider + model mapping 保存后 CrewProxy 热加载生效。
- API key 不在 GET 响应、日志、校验错误中泄漏。
