# Implementation Plan: Download 客户端发布中心（Download Center）

**Branch**: `004-download-center` | **Date**: 2026-04-07 | **Spec**: `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\spec.md`  
**Input**: Feature specification from `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\spec.md`

**设计思路（用户补充）**：公网落地页采用 **极简、大方** 的 Landing Page 风格，减少信息噪音，**消除用户安装焦虑**；核心视觉区居中展示 Logo + Slogan；下载区按 OS 自动高亮（.exe / .dmg / .deb）；Changelog 展示迭代历史并标注 **New / Fix**；展示 **MD5/SHA256** 校验码；**下载进度条动画** 仅在客户端内升级场景（非纯浏览器落地页）。

## Summary

建设「客户端发布中心」：后台维护发布与多平台资产元数据（URL、哈希、强制/可选），**二进制不存关系库**；公网提供 Landing 下载页（UA 智能推荐 + 备用平台 + Release Notes）；客户端通过 **`/releases/latest`**（或等价 `GET /api/v1/...`）做静默升级判断。本期与既有业务模块零耦合，仅被客户端 Update Checker 消费。

## Technical Context

**Language/Version**: Python 3.11+（后端）；TypeScript 5.x（前端）  
**Primary Dependencies**: FastAPI、SQLAlchemy 2.x Async、Alembic、Pydantic v2、React 18、Vite 6、React Router、Tailwind CSS  
**Storage**: 发布元数据与审计存主库（SQLite 开发 / MySQL 或 PostgreSQL 生产）；安装包仅引用 **OSS/静态文件 URL**（不存 BLOB）  
**Testing**: pytest、pytest-asyncio、httpx；前端 `tsc` + build  
**Target Platform**: Linux server + Browser 公网落地页 + 桌面客户端（升级检查）  
**Project Type**: Web application（backend + frontend）  
**Performance Goals**: `/releases/latest` p95 < 2s（常规负载）；落地页首屏可感知加载 < 2s（内网/公网依部署）  
**Constraints**: 二进制不落地 DB；下载 URL 需具备可观测可用性与带宽保障；**强制 vs 可选** 显式字段；**Changelog 安全渲染**（防 XSS）；Landing 静态路由优先注册  
**Scale/Scope**: 首期单产品线客户端发布；多平台资产（Windows/macOS/Linux）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

权威来源：`.specify/memory/constitution.md`（CrewCentral 项目宪章）。

- [x] **固定技术栈**：延续 Python/FastAPI/SQLAlchemy 与 React/TS/Vite/Tailwind。  
- [x] **子路径部署**：下载页、后台发布页与 API 均在 `{BASE_PATH}` 下统一挂载；`quickstart.md` 写明四一致。  
- [x] **双轨认证**：后台发布 Session + admin；公网落地页与 `/releases/latest` 为**匿名可读**（契约中明确）；若需保护则单独声明。  
- [x] **契约优先**：`contracts/openapi.yaml` 与 `contracts/ui-download-landing.md` 定义 API 与页面行为。  
- [x] **简化可扩展**：首期仅发布与下载元数据；对象存储与 CDN 边界在计划与 research 中明确。  
- [x] **命名空间与响应**：对外 API 落在 `{BASE_PATH}/api/*`；客户端 `rc` 响应与 `GET /releases/latest` 语义在 contracts 中定义。  
- [x] **安全与运维**：HTTPS、管理写接口鉴权、上传安全（若上传）、审计日志、Changelog 安全展示。

如需偏离上述 MUST，必须在下方 **Complexity Tracking** 表中记录理由与替代控制。

## Project Structure

### Documentation (this feature)

```text
specs/004-download-center/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── ui-download-landing.md
└── tasks.md             # /speckit.tasks (not created)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/routes/
│   │   ├── releases_admin.py
│   │   ├── releases_public.py
│   │   └── releases_client.py
│   ├── models/
│   │   ├── client_release.py
│   │   ├── client_release_asset.py
│   │   └── client_release_audit.py
│   ├── services/
│   │   ├── release_registry.py
│   │   └── ua_platform.py
│   └── schemas/
│       └── releases.py
└── alembic/versions/

frontend/
└── src/
    ├── pages/
    │   └── DownloadLandingPage.tsx
    ├── pages/admin/
    │   └── ReleasePublishPage.tsx
    └── components/download/
        ├── HeroSection.tsx
        ├── DownloadButtonGroup.tsx
        └── ChangelogPanel.tsx
```

**Structure Decision**：沿用现有 `backend/` + `frontend/` 增量；公网落地页与后台发布页分路由；`releases_client` 提供 `/releases/latest` 能力。

## Complexity Tracking

无宪章例外，本节留空。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|

## Post-Design Constitution Check

- [x] `research.md` 已覆盖 UA 解析、latest 语义、二进制不入库、Changelog 安全等。  
- [x] `data-model.md` 定义 Release、Asset、Audit 及校验规则。  
- [x] `contracts/openapi.yaml` 与 `contracts/ui-download-landing.md` 对齐极简 Landing 与 API。  
- [x] `quickstart.md` 含 Base Path 四一致与联调步骤。  
