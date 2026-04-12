---
description: "Task list for 002-device-manage — Device 管理与监控"
---

# Tasks: Device 管理与监控 (002-device-manage)

**Input**: Design documents from `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\002-device-manage\`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 规格未强制 TDD；本清单不含必选测试任务。

**Organization**: 用户故事顺序为 **US1 → US3 → US2**（先客户端注册/心跳与拦截，再管理端 UI），与实现依赖一致。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[USn]**: 用户故事阶段任务必带

## Path Conventions

对齐 `specs/002-device-manage/plan.md`：后端增量在 `backend/app/`；前端在 `frontend/src/`。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 依赖声明、运行配置、可选本地中间件

- [X] T001 Add PostgreSQL async driver、`redis`（async 可用）、`geoip2` 或 `maxminddb`（按选型）到 `backend/pyproject.toml`
- [X] T002 Extend `backend/.env.example` with `DATABASE_URL_DEVICES`, `REDIS_URL`, `TRUSTED_PROXY_CIDRS`, `GEOIP_MMDB_PATH`, `OFFLINE_THRESHOLD_MINUTES` per `specs/002-device-manage/quickstart.md`
- [X] T003 [P] Add `docker-compose.device-deps.yml`（或等价）在仓库根目录，仅包含 PostgreSQL + Redis 开发服务
- [X] T004 [P] Create `docs/` reference or comment block in `specs/002-device-manage/quickstart.md` linking compose file for one-command deps

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 设备域 PG、Redis、XFF、刷盘任务、领域服务 —— **完成前不得开始 US1**

**⚠️ CRITICAL**: 所有用户故事依赖本阶段

- [X] T005 Implement `backend/app/db/devices_session.py` second `AsyncEngine` + `AsyncSessionLocal` from `DATABASE_URL_DEVICES` env
- [X] T006 Implement `backend/app/core/redis.py` connection factory and key prefix helpers (`presence:`, `geo:`, `stats:`)
- [X] T007 Implement `backend/app/core/forwarded_for.py` trusted CIDR + `X-Forwarded-For` parsing per `specs/002-device-manage/research.md`
- [X] T008 [P] Implement SQLAlchemy models in `backend/app/models/device.py` (Device, presence fields) aligned with `specs/002-device-manage/data-model.md`
- [X] T009 [P] Implement `backend/app/models/blocklist.py` (blocklist entries) and `backend/app/models/device_audit.py` (admin actions, device commands) or split files per plan
- [X] T010 Create Alembic for device DB: `backend/alembic_devices/env.py`, `backend/alembic_devices/versions/0001_device_schema.py` (or single migration using `Base.metadata.create_all` pattern consistent with repo)
- [X] T011 Implement `backend/app/services/geo_ip.py` GeoIP lookup with Redis cache key `geo:{ip}` in `backend/app/core/redis.py` namespace
- [X] T012 Implement `backend/app/services/heartbeat_pipeline.py` writing heartbeat to Redis without synchronous PG update on hot path
- [X] T013 Implement `backend/app/jobs/flush_presence.py` batch UPSERT from Redis snapshots into PostgreSQL `devices` / `device_presence`
- [X] T014 Register background flush loop (asyncio task or scheduler) in `backend/app/main.py` lifespan alongside existing app setup
- [X] T015 Implement `backend/app/services/device_registry.py` idempotent upsert by `device_uuid` + `owner_user_id` from JWT

**Checkpoint**: Foundation ready — US1 can start.

---

## Phase 3: User Story 1 — 设备静默注册与心跳保活 (Priority: P1) 🎯 MVP

**Goal**: JWT 客户端 `POST /api/v1/devices/register` 与 `.../heartbeat`；真实 IP 入库；Redis 热路径 + 异步刷盘。

**Independent Test**: curl/脚本携带 Bearer JWT 完成注册与心跳，观察 Redis 与 PG（延迟）一致；无需管理 UI。

### Implementation for User Story 1

- [X] T016 [US1] Implement `backend/app/api/routes/devices_client.py` with `APIRouter` prefix `/devices` and `POST /register` using `get_current_user_id` from `backend/app/api/deps.py`
- [X] T017 [US1] In `devices_client.py`, extract client IP via `forwarded_for` + `Request` and pass to `device_registry.py` for `last_ip` / geo fields
- [X] T018 [US1] Implement `POST /heartbeat` in `devices_client.py` calling `heartbeat_pipeline.py` and optional `current_skill_slug` update
- [X] T019 [US1] Mount `devices_client` router in `backend/app/main.py` under `/api/v1` within existing `BASE_PATH` root router

**Checkpoint**: MVP 客户端链路可演示。

---

## Phase 4: User Story 3 — 黑名单与强制下线的请求拦截 (Priority: P2)

**Goal**: 黑名单/下线设备在注册与心跳被拒绝，返回稳定可分类 `rc` / 业务码；与 auth 令牌吊销策略衔接（最小可行）。

**Independent Test**: 将设备标记 block 后重放 JWT 请求，断言拒绝语义。

### Implementation for User Story 3

- [X] T020 [US3] Add reusable guard in `backend/app/services/device_policy.py` (new) or `backend/app/api/deps.py`: `assert_device_allowed(device_uuid, user_id)` reading PG + Redis cache
- [X] T021 [US3] Invoke policy guard at start of register/heartbeat handlers in `backend/app/api/routes/devices_client.py`
- [X] T022 [US3] Define error code constants in `backend/app/schemas/device_errors.py` and map to `rc` responses in `devices_client.py`
- [X] T023 [US3] Document and implement kick→session/token invalidation hook calling into `backend/app/auth/token_service.py` or `revoke_web_session` where applicable for forced offline

**Checkpoint**: US3 可独立用自动化验证。

---

## Phase 5: User Story 2 — 管理端设备浏览与管控指令 (Priority: P2)

**Goal**: Stat Cards + 筛选表格 + 行操作（踢下线/封禁/远程重启/日志）；服务端分页；审计写入。

**Independent Test**: 管理员 Session 下调列表、筛选、下发指令，审计表有记录。

### Implementation for User Story 2

- [X] T024 [US2] Implement `backend/app/api/routes/devices_admin.py`: `GET /admin/devices/stats`, `GET /admin/devices` with filters per `specs/002-device-manage/contracts/openapi.yaml`
- [X] T025 [US2] Implement admin write routes in `devices_admin.py`: `POST .../kick`, `.../block`, `.../reboot`, `GET .../logs` with `require_admin` from `backend/app/api/deps.py`
- [X] T026 [US2] Persist admin actions to `admin_device_actions` via shared helper in `backend/app/services/device_audit.py` (new)
- [X] T027 [US2] Mount `devices_admin` router under `/api/v1` in `backend/app/main.py`
- [X] T028 [US2] Implement `frontend/src/lib/devices-api.ts` for admin stats/list/actions with `credentials: 'include'`
- [X] T029 [P] [US2] Implement `frontend/src/components/devices/StatCards.tsx` per `specs/002-device-manage/contracts/ui-device-admin.md`
- [X] T030 [P] [US2] Implement `frontend/src/components/devices/StatusPing.tsx` (Ping + reduced-motion fallback)
- [X] T031 [P] [US2] Implement `frontend/src/components/devices/DeviceTable.tsx` with server pagination and action column
- [X] T032 [US2] Implement `frontend/src/components/devices/HardwareModal.tsx` triggered from IP cell
- [X] T033 [US2] Compose `frontend/src/pages/admin/DeviceManagePage.tsx` (StatCards + filters + DeviceTable)
- [X] T034 [US2] Register route `/admin/devices` in `frontend/src/App.tsx` with existing `BrowserRouter` basename

**Checkpoint**: 管理端端到端可用。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 合同对齐、文档、宪章 Base Path 复核

- [X] T035 Cross-check all device routes against `specs/002-device-manage/contracts/openapi.yaml` and update contract if drift
- [X] T036 Verify `specs/002-device-manage/contracts/ui-device-admin.md` layout vs `DeviceManagePage.tsx` and note gaps in checklist Notes
- [X] T037 Reconcile four-way Base Path (Vite, Router, FastAPI, Cookie, Nginx) for `/admin/devices` in `specs/002-device-manage/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** → **Phase 2** → **Phase 3 (US1)** → **Phase 4 (US3)** → **Phase 5 (US2)** → **Phase 6**

### User Story Dependencies

- **US1** 依赖 Phase 2。  
- **US3** 依赖 US1 路由存在 + Phase 2 黑名单模型。  
- **US2** 依赖 US1 已有设备数据与 US3 策略稳定（至少 stub 不崩溃）。

### Parallel Opportunities

- Phase 1: T003 与 T004 并行。  
- Phase 2: T008 与 T009 并行。  
- Phase 5: T029–T031 前端组件可并行开发（需 API 契约稳定）。

---

## Parallel Example: User Story 2 (after API contract frozen)

```text
Task: frontend/src/components/devices/StatCards.tsx
Task: frontend/src/components/devices/StatusPing.tsx
Task: frontend/src/components/devices/DeviceTable.tsx
```

---

## Implementation Strategy

### MVP First

1. Phase 1 + Phase 2 + Phase 3 (US1) — 客户端注册/心跳 + Redis/PG 管道。  
2. Phase 4 (US3) — 拦截语义。  
3. Phase 5 (US2) — 管理 UI。  
4. Phase 6 — 合同与运维文档。

### Suggested MVP Scope

**至 US1 + US3** 可作为「后端可交付」MVP；**US2** 为运营可见增量。

---

## Notes

- 任务总数：**37**（T001–T037）  
- **US1**: 4（T016–T019）  
- **US3**: 4（T020–T023）  
- **US2**: 11（T024–T034）  
- Setup: 4；Foundational: 11；Polish: 3  
- 所有任务含 `- [ ]`、**Task ID**、**文件路径**；用户故事任务含 **`[USn]`**
