# Research: 001-auth-login

**Date**: 2026-04-07  
**Scope**: 浏览器唤起登录、显式授权确认、凭证回传与集中鉴权。

## 1. 交互模型：Cursor / Firebase 式「先登录、后授权」

**Decision**: 采用 **两阶段 Web 流程**：（1）用户在极简页完成账号密码或 SSO，建立服务端 Session；（2）跳转到 **授权确认页**（Consent），展示客户端名、设备名、用户头像/邮箱，用户点击「确认授权」后服务端签发访问/续期凭证并组装 Custom URI 回传。取消则带错误码重定向或展示可重试页。

**Rationale**: 与 Cursor、Firebase OAuth 一致，将「身份验证」与「向特定客户端授予令牌」分离，满足「界面极简但突出授权确认」；避免在未知客户端上静默发令牌。

**Alternatives considered**:

- 单页登录后直接发 token：更简单但弱于显式同意，与需求不符。
- 仅设备码流（Device Code）：适合无浏览器场景，与当前「唤起默认浏览器」主路径不一致，可作为后续扩展。

## 2. `state` 与授权请求绑定

**Decision**: 首次从客户端 Query 进入时创建 **AuthorizationRequest** 记录：`state`（高熵随机）、`client_label`、`device_label`、过期时间（如 10–15 分钟）、与后续 Session 绑定。登录与确认均校验同一 `state` 与会话用户一致性。

**Rationale**: 防 CSRF、防错绑用户；支撑 UI 文案「正在尝试登录 [客户端名称]」「设备 [Device_Name]」。

**Alternatives considered**: 仅依赖 Cookie 不设服务端 state——拒绝，无法满足多 Tab 与跨设备文案绑定。

## 3. JWT 与集中校验

**Decision**: 所有访问/续期 JWT 的签发、解析、claims 校验集中在 `app/core/security.py`（及 `api/deps.py` 依赖注入）；业务路由仅依赖 `get_current_user_id` 等抽象。可选：在 Nginx/API 网关层增加 JWT 校验以统一南北向流量（与宪章「网关或中间件」一致）。

**Rationale**: 满足 FR-007，避免校验逻辑漂移。

**Alternatives considered**: 每路由手写 `jwt.decode`——拒绝。

## 4. 密码存储

**Decision**: 默认 **Argon2id**（若依赖选 argon2-cffi）；若团队更熟 bcrypt，则使用 passlib bcrypt，cost 因子按当前 OWASP 建议配置。

**Rationale**: 符合 FR-006 与宪章安全预期。

**Alternatives considered**: PBKDF2-only——可接受但非首选。

## 5. 前端：居中卡片与 Glassmorphism

**Decision**: 使用 Tailwind：`backdrop-blur-md`、`bg-white/40` 或 `bg-slate-900/30` 等 + 圆角卡片容器；主按钮大字号、`aria` 标签完整；成功页绿色对勾用 SVG 或 Lucide；倒计时 3–5 秒后 `window.close()`，失败则降级为提示「可手动关闭」。

**Rationale**: 满足 UI 需求且保持可访问性（对比度需在实现时用工具复核）。

**Alternatives considered**: 重 CSS-in-JS——与宪章 Tailwind 栈不一致。

## 6. 响应体 `rc` 约定

**Decision**: 面向桌面客户端与一致消费方的 JSON 统一 `{ "rc": 0|1, "data"?, "message" }`；内部管理接口若返回 FastAPI 默认 `detail`，在合同中标注并在前端区分。

**Rationale**: 与项目宪章「Contracts & Compatibility」一致。

## 7. 已解决的开放项

技术上下文中无遗留 **NEEDS CLARIFICATION**；SSO 具体 IdP 以实现阶段 Adapter 配置为准，接口形状在 `contracts/openapi.yaml` 预留扩展点。
