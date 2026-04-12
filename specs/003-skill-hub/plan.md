# Implementation Plan: Skill 技能下发中心（Skill Hub）

**Branch**: `003-skill-hub` | **Date**: 2026-04-07 | **Spec**: `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\003-skill-hub\spec.md`  
**Input**: Feature specification from `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\003-skill-hub\spec.md`

## Summary

建设「技能下发中心」：后台提供类似应用商店/插件市场的技能大厅（左侧分类导航 + 右侧卡片流网格）、技能版本管理与权限配置；客户端通过受控接口拉取可用技能清单与目标版本，按需静默下载并做哈希校验后更新。本期设计保持与既有 `auth-login`、`device-manage` 一致的认证与设备约束策略，并通过短效下载凭据满足防盗链要求。

## Technical Context

**Language/Version**: Python 3.11+（后端）；TypeScript 5.x（前端）  
**Primary Dependencies**: FastAPI、SQLAlchemy 2.x Async、Alembic、Pydantic v2、React 18、Vite 6、React Router、Tailwind CSS  
**Storage**: 技能元数据与授权配置存主库（SQLite 开发 / MySQL 或 PostgreSQL 生产）；技能包文件使用本地文件系统（后续可迁对象存储）  
**Testing**: pytest、pytest-asyncio、前端类型检查与关键页面交互测试  
**Target Platform**: Linux server + Browser 管理端 + 桌面客户端（技能拉取方）  
**Project Type**: Web application（backend + frontend）  
**Performance Goals**: 技能清单查询 p95 < 300ms（单租户常规负载）；后台技能大厅首屏可见时间 < 2s（常规内网）  
**Constraints**: 必须区分 Session 与 JWT；必须遵循 Base Path；技能绑定配置需结构化 JSON 存储；下载地址需短效授权；客户端加载前必须 hash 校验  
**Scale/Scope**: 首期目标 2000 技能条目、单技能 100 版本级别、10k 设备日常拉取

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

权威来源：`.specify/memory/constitution.md`（CrewCentral 项目宪章）。

- [x] **固定技术栈**：延续现有 Python/FastAPI/SQLAlchemy 与 React/TS/Vite/Tailwind。  
- [x] **子路径部署**：规划中所有路由与页面均以 `{BASE_PATH}` 组织并在 quickstart 明确四一致。  
- [x] **双轨认证**：后台管理接口使用 Session；客户端技能清单与下载令牌接口使用 Bearer。  
- [x] **契约优先**：`contracts/openapi.yaml` 与 `contracts/ui-skill-hub.md` 定义 API 与页面行为。  
- [x] **简化可扩展**：首期仅实现技能分发中心，不扩展到 runtime/在线 IDE；对象存储等留边界。  
- [x] **命名空间与响应**：管理与客户端接口均在 `{BASE_PATH}/api/v1/*`，客户端响应遵循 `rc` 约定。  
- [x] **安全与运维**：规划包含上传校验、短效下载签名、哈希校验字段、管理操作审计日志。

如需偏离上述 MUST，必须在下方 **Complexity Tracking** 表中记录理由与替代控制。

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
backend/
├── app/
│   ├── api/routes/
│   │   ├── skills_client.py
│   │   └── skills_admin.py
│   ├── models/
│   │   ├── skill.py
│   │   ├── skill_version.py
│   │   └── skill_assignment.py
│   ├── services/
│   │   ├── skill_registry.py
│   │   ├── skill_distribution.py
│   │   └── download_token.py
│   └── schemas/
│       └── skills.py
└── tests/
    ├── integration/
    └── contract/

frontend/
└── src/
    ├── pages/admin/
    │   ├── SkillHubPage.tsx
    │   └── SkillAssignmentPage.tsx
    ├── components/skills/
    │   ├── SkillCategoryNav.tsx
    │   ├── SkillCardGrid.tsx
    │   ├── SkillCard.tsx
    │   └── SkillConfigEditor.tsx
    └── lib/
        └── skills-api.ts
```

**Structure Decision**: 采用现有 web application 双目录结构（`backend/` + `frontend/`），仅在现有模块下增量添加技能分发领域对象与页面。

## Complexity Tracking

无宪章例外，本节留空。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|

## Post-Design Constitution Check

- [x] `research.md` 已覆盖短效下载凭据、授权冲突优先级、卡片流布局等关键决策。  
- [x] `data-model.md` 定义了技能、版本、授权、下载凭据、审计实体，并保持扩展边界。  
- [x] `contracts/openapi.yaml` 已区分 Session 管理接口与 Bearer 客户端接口，并遵循 `{BASE_PATH}/api/v1/*`。  
- [x] `contracts/ui-skill-hub.md` 已落实“左分类 + 右卡片流”与卡片交互细节。  
- [x] `quickstart.md` 已给出 Base Path 四一致与联调步骤。  
