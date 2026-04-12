<!--
Sync Impact Report
- Version: 1.0.0 → 1.1.0
- Modified principles: 无（标题与治理章节扩充；原则 I–V 未改名）
- Added sections: Governance 子节「修订程序」「版本策略」「符合性评审」
- Removed sections: 无
- Templates:
  - .specify/templates/plan-template.md ✅ updated（Constitution Check 具体门禁）
  - .specify/templates/spec-template.md ✅ updated（新增 Constitution Check 小节）
  - .specify/templates/tasks-template.md ✅ updated（宪章相关任务提示）
  - .specify/templates/commands/*.md ⚠ 路径不存在；已检查 .cursor/commands/*.md 无 CLAUDE 专用残留
- Follow-up TODOs:
  - TODO(AUTH_PROVIDER): 选择并实现具体身份提供方（IdP/IAM/SSO）集成。
  - TODO(SESSION_STORE): 决定是否将内存 Session 迁移至 Redis/DB 以支持 HA。
-->

# CrewCentral Constitution

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

注：登录方式本身必须可插拔（Auth Adapter），由项目方选择具体登录体系（见「认证可插拔」）。

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
- **技能可见性**：公开列表/搜索仅展示「已审批/已通过」状态；详情是否过滤状态必须在规格中定死并保持一致。
- **上传策略**：按 `slug` 覆盖式 upsert（不维护历史版本链路）。
- **下载计数**：下载成功后 `download_count + 1`。
- **设备上报**：以 `device_uuid` 幂等 upsert；用户信息来自 JWT；是否保存 token 原文必须在规格中明确并落实
  敏感信息保护策略。
- **版本中心**：必须支持多平台下载 URL；如实现分片上传，必须有临时目录清理与合并锁，避免并发合并破坏文件。

## Security & Ops

- **HTTPS**：生产必须启用。
- **Secrets**：`SESSION_SECRET` 与 `JWT_SECRET` 必须为高强度随机值，且相互独立。
- **管理接口**：所有管理写接口必须执行 admin 鉴权；不得出现「仅前端隐藏、后端未鉴权」的实现。
- **上传安全**：必须校验 ZIP 合法性与 `SKILL.md`；禁止路径穿越；禁止在日志中输出 token/密钥/上传文件敏感内容。
- **可观测性**：必须具备基础运行日志（认证、上传、分片合并、管理操作、设备上报），但不强制审计系统。

## Governance

本宪章用于 CrewCentral 及相关能力的规格驱动开发（SDD），并覆盖与其冲突的临时约定。

### 修订程序

- 任何新增原则、变更原则措辞或扩大 MUST 范围，必须先更新 `.specify/memory/constitution.md`；若仓库根目录存在
  `constitution.md` 作为同步副本，必须一并更新。
- 必须在文件顶部 Sync Impact Report（HTML 注释）中记录：版本变化、原则变更、模板同步状态、暂缓 TODO。
- 对调用方或部署行为有重大影响的变更，必须在变更说明中写明迁移步骤或影响范围。

### 版本策略

宪章版本遵循语义化版本（Semantic Versioning）：

- **MAJOR**：废除或重新定义原则、向后不兼容的治理变更。
- **MINOR**：新增原则或章节，或对现有指导作实质性扩充。
- **PATCH**：措辞澄清、错别字、不改变规范含义的编辑。

### 符合性评审

- 每个功能 `spec.md` 必须包含 **Constitution Check** 小节，并对照本宪章逐条自证；`plan.md` 在 Phase 0 前与 Phase 1
  设计完成后须重复核验同一组门禁。
- 如需例外，必须在 spec 的 Constitution Check 与 plan 的 Complexity Tracking 中同时写明理由与替代控制措施。
- Code review 对涉及认证、Base Path、对外 API 契约或存储路径的改动，须能指出其宪章对齐依据（可简短）。

**Version**: 1.1.0 | **Ratified**: 2026-03-31 | **Last Amended**: 2026-04-07
