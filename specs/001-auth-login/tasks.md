---
description: "Task list for 001-auth-login — Auth & Login 登录管理系统"
---

# Tasks: Auth & Login 登录管理系统 (001-auth-login)

**Input**: Design documents from `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\001-auth-login\`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 规格未要求 TDD；本清单不含强制测试任务，可在 Polish 阶段按需补合同测试。

**Organization**: 按用户故事优先级（US1 → US2 → US3）分阶段，任务格式 `[ID] [P?] [USn] Description` + 明确文件路径。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[USn]**: 仅用户故事阶段任务携带，对应 spec 中 User Story n

## Path Conventions

本清单路径对齐 `specs/001-auth-login/plan.md`：**后端** `backend/app/`；**前端** `frontend/src/`。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化仓库内 backend/frontend 工程与工具链

- [x] T001 Create directory tree `backend/app/core/`, `backend/app/db/`, `backend/app/models/`, `backend/app/schemas/`, `backend/app/api/routes/`, `backend/app/auth/adapters/`, `backend/alembic/versions/`, `backend/tests/`, `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/lib/` per `specs/001-auth-login/plan.md`
- [x] T002 Initialize Python project with `backend/pyproject.toml` using uv: FastAPI, SQLAlchemy 2 async, Alembic, pydantic-settings, python-jose or PyJWT, passlib or argon2-cffi, aiosqlite, uvicorn
- [x] T003 Initialize `frontend/` with Vite 6 + React 18 + TypeScript (`package.json`, `vite.config.ts`, `tsconfig.json`)
- [x] T004 [P] Add Ruff (or equivalent) and pytest dev dependencies in `backend/pyproject.toml`
- [x] T005 [P] Add and configure Tailwind CSS + PostCSS in `frontend/tailwind.config.js` and `frontend/postcss.config.js`
- [x] T006 Add `backend/.env.example` and `frontend/.env.example` documenting `BASE_PATH`, `SESSION_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `SKIP_AUTH`, `VITE_BASE_PATH` per `specs/001-auth-login/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 数据库、安全单点、路由骨架、Session/JWT 分离 —— **完成前不得开始用户故事实现**

**⚠️ CRITICAL**: 所有 US 依赖本阶段完成

- [x] T007 Implement `backend/app/db/base.py` (DeclarativeBase) and `backend/app/db/session.py` (async engine + AsyncSessionLocal)
- [x] T008 [P] Implement SQLAlchemy model `User` in `backend/app/models/user.py` per `specs/001-auth-login/data-model.md`
- [x] T009 [P] Implement SQLAlchemy model `AuthorizationRequest` in `backend/app/models/authorization_request.py`
- [x] T010 [P] Implement SQLAlchemy model `Session` (web session) in `backend/app/models/session.py`
- [x] T011 [P] Implement SQLAlchemy model `RefreshToken` in `backend/app/models/refresh_token.py`
- [x] T012 Create Alembic env and initial migration under `backend/alembic/versions/` creating all tables from T008–T011
- [x] T013 Implement `backend/app/core/config.py` loading `BASE_PATH`, secrets, `DATABASE_URL`, `SKIP_AUTH` via pydantic-settings
- [x] T014 Implement `backend/app/core/security.py` as **sole** module for password hash/verify (Argon2 or bcrypt) and JWT encode/decode helpers
- [x] T015 Implement shared JSON envelope helpers for `{ "rc", "message", "data" }` in `backend/app/schemas/rc.py` (or `backend/app/schemas/__init__.py`)
- [x] T016 Implement `backend/app/api/deps.py`: `get_current_user_id` from Bearer JWT (delegating to `core/security.py` only) and `require_admin`
- [x] T017 Implement `backend/app/main.py`: FastAPI app factory, mount routers under configurable `BASE_PATH`, configure session middleware and Cookie `path` aligned with Base Path, **register static/detail routes before catch-all dynamic routes** (constitution)
- [x] T018 Add stub `backend/app/auth/adapters/base.py` and `backend/app/auth/adapters/local.py` for future SSO swap per `specs/001-auth-login/research.md`

**Checkpoint**: Foundation ready — user story phases can start.

---

## Phase 3: User Story 1 — 浏览器完成登录并将凭证交回桌面客户端 (Priority: P1) 🎯 MVP

**Goal**: 瘦客户端唤起浏览器 → 登录/SSO → **授权确认页** → 签发 access/refresh → Custom URI 回传；`state` 全程绑定防伪造。

**Independent Test**: 客户端打开登录 URL → 完成登录与授权确认 → 深度链接收到 `state` 与双令牌；不依赖 refresh/revoke。

### Implementation for User Story 1

- [x] T019 [US1] Implement service functions for creating/validating `AuthorizationRequest` (state expiry, client_label, device_label, redirect_scheme) in `backend/app/auth/service.py`
- [x] T020 [US1] Implement `backend/app/auth/routes.py`: `GET` login entry creating/persisting state and redirecting to SPA login route; local credential `POST` login setting HttpOnly session; constitution endpoints `GET /auth/userinfo`, `GET /auth/logout` (paths prefixed by app `BASE_PATH`)
- [x] T021 [US1] Implement `GET /auth/callback` (or SSO adapter hook) placeholder redirect handling in `backend/app/auth/routes.py` with safe error pages for IdP cancel/timeout
- [x] T022 [US1] Implement `POST` handler for consent confirmation matching `specs/001-auth-login/contracts/openapi.yaml` (`/api/v1/auth/consent/confirm`) in `backend/app/api/routes/consent.py`, issuing JWT access + refresh, persisting `RefreshToken` hash, returning `callback_uri`
- [x] T023 [US1] Implement `frontend/src/pages/LoginPage.tsx`: minimal centered form (logo, account, password, SSO button) per spec FR-008
- [x] T024 [US1] Implement `frontend/src/pages/ConsentPage.tsx`: centered card, Glassmorphism, copy strings from `specs/001-auth-login/contracts/ui-authorization.md` (client name, device name, avatar, email, Confirm/Cancel)
- [x] T025 [US1] Implement `frontend/src/pages/AuthSuccessPage.tsx`: success message, green checkmark, trigger Custom URI with tokens from API response, **initial** countdown close attempt
- [x] T026 [US1] Wire `frontend/src/App.tsx` and `frontend/src/main.tsx` with React Router `basename` from `import.meta.env.VITE_BASE_PATH` and routes for Login, Consent, Success
- [x] T027 [US1] Implement `frontend/src/lib/api.ts` (or `frontend/src/lib/rc.ts`) for typed `rc` JSON client helpers toward `backend` `/api/*`

**Checkpoint**: MVP — 端到端登录 + 授权 + 回传可用。

---

## Phase 4: User Story 2 — 客户端无感续期与后台会话废除 (Priority: P2)

**Goal**: `POST /api/v1/auth/refresh`；`POST /api/v1/admin/sessions/{session_id}/revoke`；轮换 refresh token；结构化日志。

**Independent Test**: 使用已登录用户的 refresh token 调用续期；管理员调用废除后旧 token 失效。

### Implementation for User Story 2

- [x] T028 [US2] Implement `backend/app/api/routes/auth_refresh.py` for `POST /api/v1/auth/refresh` per `specs/001-auth-login/contracts/openapi.yaml` with rotation and `rc` envelope
- [x] T029 [US2] Implement refresh token validation, revocation, and session linkage in `backend/app/auth/token_service.py` (or extend `backend/app/auth/service.py`) using only `core/security.py` for JWT
- [x] T030 [US2] Implement `backend/app/api/routes/admin_sessions.py` for `POST /api/v1/admin/sessions/{session_id}/revoke` with `require_admin` and cascade revoke refresh tokens
- [x] T031 [US2] Add structured logging (auth refresh, revoke, actor) in the above routes per `specs/001-auth-login/data-model.md` audit expectations

**Checkpoint**: US2 可独立验证。

---

## Phase 5: User Story 3 — 登录成功过渡与唤醒失败时的兜底 (Priority: P2)

**Goal**: 深度链接失败时复制与重试；取消授权的可理解反馈。

**Independent Test**: 禁用或拦截 `window.location` 到 custom scheme 后仍可通过复制/重试完成闭环。

### Implementation for User Story 3

- [x] T032 [US3] Extend `frontend/src/pages/AuthSuccessPage.tsx`: expose copy-to-clipboard for token payload or full callback URI (per security UX review), and **retry** deep-link button
- [x] T033 [US3] Add `frontend/src/pages/AuthCancelledPage.tsx` (or query-param branch) for consent cancel with readable message and link back to client/docs

**Checkpoint**: US3 可独立验证。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 文档、宪章四一致、合同对齐

- [x] T034 Add sample Nginx `location` snippet for `BASE_PATH` proxy to `specs/001-auth-login/quickstart.md` (or `docs/nginx-woicrew-example.conf` at repo root)
- [x] T035 Verify four-way Base Path alignment documented: `frontend` vite `base` + Router `basename`, FastAPI mount, Session cookie `Path`, Nginx — update `specs/001-auth-login/quickstart.md` checklist
- [x] T036 Cross-verify all implemented paths and JSON shapes against `specs/001-auth-login/contracts/openapi.yaml` and `specs/001-auth-login/contracts/ui-authorization.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，可立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1 完成
- **Phase 3 (US1)**: 依赖 Phase 2 完成
- **Phase 4 (US2)**: 依赖 Phase 2；逻辑上在 US1 之后或与之并行仅当 refresh 服务不依赖登录 UI（实现上仍建议 US1 完成后再接 US2）
- **Phase 5 (US3)**: 依赖 US1 中 `AuthSuccessPage.tsx` 与 consent 成功路径存在
- **Phase 6 (Polish)**: 依赖核心功能完成

### User Story Dependencies

- **US1 (P1)**: Phase 2 之后 — 无其他故事依赖
- **US2 (P2)**: 需要 refresh token 模型与 JWT 模块（Phase 2）+ 可选 US1 完成后再接集成测试
- **US3 (P2)**: 依赖 US1 成功页骨架

### Parallel Opportunities

- **Phase 1**: T004 与 T005 并行
- **Phase 2**: T008–T011 模型文件并行
- **Phase 3**: T023 `LoginPage.tsx` 与 T024 `ConsentPage.tsx` 可在 API 契约稳定后并行（需与 T022 对齐字段）

---

## Parallel Example: User Story 1 (after Phase 2)

```bash
# 可并行（不同文件）:
Task: "Implement frontend/src/pages/LoginPage.tsx ..."
Task: "Implement frontend/src/pages/ConsentPage.tsx ..."
Task: "Implement backend/app/auth/service.py ..."
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2  
2. Complete Phase 3 (US1)  
3. **STOP and VALIDATE**: 端到端浏览器登录 → 授权确认 → Custom URI 回传 + `state` 校验  

### Incremental Delivery

1. Setup + Foundation → 可部署空壳 API + DB  
2. US1 → 可演示瘦客户端登录 MVP  
3. US2 → 续期与后台废除  
4. US3 → 兜底与取消页  
5. Polish → 运维与合同对齐  

### Suggested MVP Scope

**仅 User Story 1（Phase 1–3）** 作为 MVP；US2/US3 为后续迭代。

---

## Notes

- 任务总数：**36**（T001–T036）
- **US1**: 9 个任务（T019–T027）  
- **US2**: 4 个任务（T028–T031）  
- **US3**: 2 个任务（T032–T033）  
- Setup: 6；Foundational: 12；Polish: 3  
- 所有任务均含 **`- [ ]`、Task ID、文件路径**；用户故事任务均含 **`[USn]`** 标签
