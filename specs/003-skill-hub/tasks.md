---
description: "Task list for 003-skill-hub — Skill 技能下发中心"
---

# Tasks: Skill 技能下发中心（003-skill-hub）

**Input**: Design documents from `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\003-skill-hub\`  
**Prerequisites**: plan.md（required）, spec.md（required）, research.md, data-model.md, contracts/

**Tests**: 规格未强制 TDD，本清单不包含必选测试任务。  

**Organization**: 用户故事顺序为 **US1 → US2 → US3**（先管理技能资产，再做授权配置，最后客户端热更新链路）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[USn]**: 所属用户故事
- 每个任务包含明确文件路径

## Path Conventions

本项目为 web app，使用 `backend/app/` 与 `frontend/src/` 双目录结构。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 依赖、配置与基础目录准备

- [X] T001 Add skill-hub dependencies to `backend/pyproject.toml`（multipart/hash/signing/file-validate 相关）
- [X] T002 Extend `backend/.env.example` with skill-hub vars（`SKILL_STORAGE_ROOT`, `SKILL_DOWNLOAD_TOKEN_TTL_SECONDS`, `SKILL_MAX_UPLOAD_MB`）
- [X] T003 [P] Create skill package storage README in `backend/storage/skills/README.md`（目录规则与清理策略）
- [X] T004 [P] Add quick local sample payload docs in `specs/003-skill-hub/quickstart.md`（manifest/download-token curl 样例）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 数据模型、迁移、核心服务与路由骨架（完成前不开始任何用户故事）

**⚠️ CRITICAL**: 所有用户故事依赖本阶段

- [X] T005 Create SQLAlchemy models `backend/app/models/skill.py`, `backend/app/models/skill_version.py`, `backend/app/models/skill_assignment.py`, `backend/app/models/skill_audit.py`
- [X] T006 Create migration for skill-hub schema in `backend/alembic/versions/`（skills/versions/assignments/tokens/audit）
- [X] T007 Implement request/response schemas in `backend/app/schemas/skills.py`
- [X] T008 [P] Implement package metadata parser + validation in `backend/app/services/skill_registry.py`（校验 `SKILL.md` 与版本信息）
- [X] T009 [P] Implement signed short-lived token service in `backend/app/services/download_token.py`
- [X] T010 [P] Implement distribution rule resolver in `backend/app/services/skill_distribution.py`（用户优先于用户组；平台过滤）
- [X] T011 Implement admin session dependency reuse in `backend/app/api/deps.py`（skills admin 使用 Session 管理员鉴权）
- [X] T012 Create API route files `backend/app/api/routes/skills_admin.py` and `backend/app/api/routes/skills_client.py`
- [X] T013 Mount skill routers in `backend/app/main.py` under `{BASE_PATH}/api/v1/*`
- [X] T014 Add skill models export in `backend/app/models/__init__.py`

**Checkpoint**: Foundation ready — 可进入各用户故事实现

---

## Phase 3: User Story 1 — 技能库管理与版本治理 (Priority: P1) 🎯 MVP

**Goal**: 管理员可上传技能包、解析元数据、查看版本历史与更新日志，并在技能大厅卡片流浏览技能库。

**Independent Test**: 管理员上传包后，在技能大厅与详情页能看到新版本与日志，异常包被拒绝。

### Implementation for User Story 1

- [X] T015 [US1] Implement `POST /api/v1/admin/skills/upload` in `backend/app/api/routes/skills_admin.py`
- [X] T016 [US1] Implement `GET /api/v1/admin/skills`（分类/关键词/分页）in `backend/app/api/routes/skills_admin.py`
- [X] T017 [US1] Implement `GET /api/v1/admin/skills/{skill_id}/versions` in `backend/app/api/routes/skills_admin.py`
- [X] T018 [US1] Persist upload/publish audit logs via `backend/app/services/skill_registry.py` + `backend/app/models/skill_audit.py`
- [X] T019 [US1] Build API client methods in `frontend/src/lib/skills-api.ts`（list/upload/versions）
- [X] T020 [P] [US1] Build category navigation `frontend/src/components/skills/SkillCategoryNav.tsx`（全部/自动化/采集/社交/自定义）
- [X] T021 [P] [US1] Build card component `frontend/src/components/skills/SkillCard.tsx`（icon、name+version、desc、hover 快捷入口）
- [X] T022 [P] [US1] Build card grid `frontend/src/components/skills/SkillCardGrid.tsx`（卡片流布局）
- [X] T023 [US1] Compose page `frontend/src/pages/admin/SkillHubPage.tsx`（左导航 + 右网格 + 上传入口）
- [X] T024 [US1] Register route `/admin/skills` in `frontend/src/App.tsx`

**Checkpoint**: US1 可独立演示（技能库管理 + 卡片流展示）

---

## Phase 4: User Story 2 — 用户/用户组技能授权与参数配置 (Priority: P1)

**Goal**: 管理员可给用户/用户组绑定技能，配置 JSON 参数，并控制全设备/分组分发开关。

**Independent Test**: 对某用户完成技能绑定及配置后，保存成功并在再次打开页面时可读回。

### Implementation for User Story 2

- [X] T025 [US2] Implement `PUT /api/v1/admin/skills/assignments` in `backend/app/api/routes/skills_admin.py`
- [X] T026 [US2] Implement `POST /api/v1/admin/skills/{skill_id}/toggle-dispatch` in `backend/app/api/routes/skills_admin.py`
- [X] T027 [US2] Add assignment merge/priority logic in `backend/app/services/skill_distribution.py`
- [X] T028 [US2] Add JSON object validation for assignment config in `backend/app/schemas/skills.py`
- [X] T029 [US2] Add assignment/toggle audit records in `backend/app/models/skill_audit.py` + service hooks
- [X] T030 [US2] Build config editor `frontend/src/components/skills/SkillConfigEditor.tsx`（JSON 编辑与错误提示）
- [X] T031 [US2] Build assignment page `frontend/src/pages/admin/SkillAssignmentPage.tsx`（左对象选择 + 右技能勾选配置）
- [X] T032 [US2] Extend `frontend/src/lib/skills-api.ts` with assignment/toggle endpoints
- [X] T033 [US2] Register route `/admin/skills/assignments` in `frontend/src/App.tsx`

**Checkpoint**: US2 可独立演示（权限绑定 + 参数配置 + 分发开关）

---

## Phase 5: User Story 3 — 客户端动态拉取与静默热更新 (Priority: P2)

**Goal**: 客户端按身份与设备平台拉取技能清单，按需申请短效下载凭据并完成 hash 校验所需信息获取。

**Independent Test**: 客户端请求 manifest 可得到可用技能与目标版本；无权限或 token 过期时被拒绝。

### Implementation for User Story 3

- [X] T034 [US3] Implement `GET /api/v1/skills/manifest` in `backend/app/api/routes/skills_client.py`
- [X] T035 [US3] Implement `POST /api/v1/skills/{skill_slug}/download-token` in `backend/app/api/routes/skills_client.py`
- [X] T036 [US3] Add secure package download endpoint in `backend/app/api/routes/skills_client.py`（校验短效 token 后返回文件）
- [X] T037 [US3] Include `package_hash` and target version in manifest payload from `backend/app/services/skill_distribution.py`
- [X] T038 [US3] Add token expiry/reuse guard logic in `backend/app/services/download_token.py`
- [X] T039 [US3] Add platform gating integration with device metadata in `backend/app/services/skill_distribution.py`
- [X] T040 [US3] Document client update flow + hash verification in `specs/003-skill-hub/quickstart.md`

**Checkpoint**: US3 可独立演示（拉取清单 + 下载凭据 + 安全门禁）

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 契约对齐、基础安全强化与交付自检

- [X] T041 Cross-check all skill routes against `specs/003-skill-hub/contracts/openapi.yaml` and fix drift
- [X] T042 Verify UI behavior vs `specs/003-skill-hub/contracts/ui-skill-hub.md`（hover 快捷入口、阴影、卡片布局）
- [X] T043 Ensure Base Path 4-way consistency for `/admin/skills*` across `frontend/src/main.tsx`, `frontend/src/App.tsx`, `backend/app/main.py`, deployment notes
- [X] T044 Add security notes for upload validation/path traversal/log redaction in `specs/003-skill-hub/quickstart.md`
- [X] T045 Run end-to-end manual quickstart validation and capture results in `specs/003-skill-hub/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖  
- **Phase 2 (Foundational)**: 依赖 Phase 1，且阻塞所有用户故事  
- **Phase 3/4/5 (US1/US2/US3)**: 依赖 Phase 2 完成  
- **Phase 6 (Polish)**: 依赖目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 仅依赖 Foundational，可最先交付 MVP。  
- **US2 (P1)**: 依赖 US1 的技能资产基础（skills + versions）与 Foundational。  
- **US3 (P2)**: 依赖 US1/US2 的发布与授权数据。

### Within Each User Story

- 后端契约与服务优先于前端接入  
- 同一文件改动任务顺序执行  
- [P] 任务可并行（不同文件）

### Parallel Opportunities

- Phase 1：T003, T004 可并行  
- Phase 2：T008, T009, T010 可并行；T012 与 T014 可并行  
- US1：T020, T021, T022 可并行  
- US2：T030 与后端 T025-T029 可并行  
- US3：T038 与 T039 可并行

---

## Parallel Example: User Story 1

```text
Task: "Build category navigation in frontend/src/components/skills/SkillCategoryNav.tsx"
Task: "Build skill card component in frontend/src/components/skills/SkillCard.tsx"
Task: "Build card grid in frontend/src/components/skills/SkillCardGrid.tsx"
```

---

## Implementation Strategy

### MVP First

1. 完成 Setup + Foundational。  
2. 先交付 US1（技能库上传/展示）。  
3. 再交付 US2（绑定与配置）。  
4. 最后交付 US3（客户端动态分发）。

### Incremental Delivery

1. US1 可先上线给运营团队使用。  
2. US2 增量上线后启用精细化分配。  
3. US3 上线后完成端到端闭环。

### Parallel Team Strategy

1. 一组后端先完成 Phase 1/2。  
2. 前端并行准备 US1 组件（T020-T022）。  
3. US2 阶段前后端并行：后端做绑定 API，前端做配置页。  
4. US3 阶段后端优先，再由客户端联调。

---

## Notes

- `[P]` 仅表示文件级并行安全，不表示无业务依赖。  
- 每个用户故事均可独立验收，避免跨故事强耦合。  
- 实现阶段需保持与 `auth-login`、`device-manage` 的边界一致。  
