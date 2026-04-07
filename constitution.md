<!--
Sync Impact Report
- Version: (seed) → 1.0.0
- Modified principles: N/A (new seed document)
- Added sections: Technology Stack, Contracts & Compatibility, Security & Ops, Governance
- Removed sections: N/A
- Templates: N/A (this file is meant to be copied into a new project)
- Follow-up TODOs:
  - TODO(AUTH_PROVIDER): Choose and implement a concrete auth provider (IdP/IAM/SSO) integration.
  - TODO(SESSION_STORE): Decide whether to keep in-memory session or move to Redis/DB for HA.
-->

# Central Control Constitution

## Core Principles

### I. 固定技术栈（Fixed Stack）
新项目后端能力必须使用 Python 3.11+ + FastAPI + SQLAlchemy 2.x（AsyncSession 为主）实现；依赖管理使用
uv。前端必须使用 React 18 + TypeScript + Vite 6 + React Router + Tailwind CSS。

理由：该栈与现有 SDD 的架构假设一致，且便于在内网/私有化环境以 Docker + Nginx 部署。

### II. 子路径部署一致性（Base Path Consistency）
系统必须支持以统一 Base Path（例如 `/woicrew`，可配置）对外提供服务，并且以下四项必须严格一致：

- 前端 Router `basename`
- 后端路由前缀
- Session Cookie `Path`
- 反向代理（Nginx）转发规则

违反任一项都视为不可部署缺陷（会导致路由 404、Cookie 串用或登录态丢失）。

### III. 双轨认证消费方式（Session + JWT）
系统必须同时支持两类认证消费方式：

- **Web 管理端/上传等浏览器场景**：使用 Session（Cookie）维持登录态
- **客户端 API 场景**：使用 Bearer JWT 调用受保护接口

注：登录方式本身必须可插拔（Auth Adapter），由项目方选择具体登录体系（见“认证可插拔”）。

### IV. 契约优先（Contract-First）
对外 API、数据模型、文件存储映射必须在规格中明确定义，且实现不得擅自偏离：

- API 路径、方法、认证方式、请求/响应结构
- 关键业务规则（技能审核可见性、上传校验、设备上报幂等、下载计数等）
- Base Path/Legacy 路由兼容策略

理由：客户端与前端均为强契约消费者，任何隐式变更都会导致联调失败。

### V. 简化但可扩展（Simple, Extensible）
满足当前需求的最简实现优先（YAGNI），但必须为以下扩展保留明确边界点：

- Session 存储从内存迁移至 Redis/DB（HA）
- 文件存储从本地目录迁移至对象存储（S3/OSS）
- 管理员来源从人工名单扩展至角色映射（IAM roles / LDAP group）
- 设备 token 存储策略升级（不存明文、摘要、独立设备授权）

## Technology Stack

- **Backend**: Python 3.11+ / FastAPI / SQLAlchemy 2.x（AsyncSession）/ uv
- **Frontend**: React 18 / TypeScript / Vite 6 / React Router / Tailwind CSS
- **DB**: SQLite（开发默认）/ MySQL（生产建议）
- **Storage**: 本地文件系统（bundles/releases/.uploads）
- **Proxy/Deploy**: Nginx（或等价）+ Docker Compose

## Contracts & Compatibility

### API 命名空间
所有对外能力必须以 `{BASE_PATH}/auth/*` 与 `{BASE_PATH}/api/*` 组织；可选提供无前缀兼容路由
（由 `ENABLE_LEGACY_ROUTES` 或等价配置控制）。

### 响应体约定（客户端优先）
客户端可见的 JSON 响应优先采用统一结构：

- 成功：`{ "rc": 0, "data": <T>, "message": "返回成功" }`
- 失败：`{ "rc": 1, "message": "<原因>" }`

允许少量 Web/管理接口返回裸 JSON 或 `{ "detail": "..." }`，但必须在规格中标注并在前端做兼容处理。

### 路由顺序约束（静态优先）
存在 `/download` 与 `/{slug}` 同级冲突风险的领域路由，必须保证静态路由先注册，避免被动态路由误吞。

## 认证可插拔（Auth Adapter Requirements）

新项目必须实现一个认证适配层（Auth Adapter），其对外提供下列能力与约束，但不绑定具体 IAM/SSO：

- **Endpoints**: `GET /auth/login`、`GET /auth/callback`（或等价回调）、`GET /auth/userinfo`、`GET /auth/logout`
- **Redirect 安全**：`redirect_uri`/`returnUrl` 必须白名单控制，禁止任意跳转（Open Redirect）
- **Web Session**：登录成功后能建立 Session 并返回 `userinfo`（含 `account/name/user_id/isAdmin` 等最小字段）
- **Client JWT**：能为客户端签发 Bearer JWT（HS256），密钥 `JWT_SECRET` 独立配置，过期时间可配置
- **开发开关**：允许 `SKIP_AUTH=1` 返回本地调试用户与 JWT（生产禁止）

## 数据与存储约束（Non-negotiable）

- **技能包**：ZIP 必须包含 `SKILL.md`；YAML frontmatter 至少校验 `slug/name/version/publisher`，其中
  `version` 与 `publisher` 强制非空；文件落盘规则固定为 `bundles/{slug}.zip`。
- **技能可见性**：公开列表/搜索仅展示“已审批/已通过”状态；详情是否过滤状态必须在规格中定死并保持一致。
- **上传策略**：按 `slug` 覆盖式 upsert（不维护历史版本链路）。
- **下载计数**：下载成功后 `download_count + 1`。
- **设备上报**：以 `device_uuid` 幂等 upsert；用户信息来自 JWT；是否保存 token 原文必须在规格中明确并落实
  敏感信息保护策略。
- **版本中心**：必须支持多平台下载 URL；如实现分片上传，必须有临时目录清理与合并锁，避免并发合并破坏文件。

## Security & Ops

- **HTTPS**：生产必须启用。
- **Secrets**：`SESSION_SECRET` 与 `JWT_SECRET` 必须为高强度随机值，且相互独立。
- **管理接口**：所有管理写接口必须执行 admin 鉴权；不得出现“仅前端隐藏、后端未鉴权”的实现。
- **上传安全**：必须校验 ZIP 合法性与 `SKILL.md`；禁止路径穿越；禁止在日志中输出 token/密钥/上传文件敏感内容。
- **可观测性**：必须具备基础运行日志（认证、上传、分片合并、管理操作、设备上报），但不强制审计系统。

## Governance

本宪章用于新项目的规格驱动开发（spec-driven development），并覆盖与其冲突的临时约定。
当需要新增原则、变更原则或扩大强制约束时，必须：

- 更新宪章并记录变更原因与迁移影响
- 以语义化版本（Semantic Versioning）递增版本号
- 在每个 spec 的 “Constitution Check” 中验证符合性；如需例外，必须写明理由与替代控制

**Version**: 1.0.0 | **Ratified**: 2026-03-31 | **Last Amended**: 2026-03-31
