# Implementation Plan: Auth & Login 登录管理系统

**Branch**: `001-auth-login` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-auth-login/spec.md`；补充设计：参考 Cursor/Firebase 式「浏览器唤起 + 显式授权确认」；居中卡片流、磨砂玻璃、授权成功绿色对勾与倒计时关页。

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

在瘦客户端策略下，由桌面端唤起系统浏览器完成身份校验；身份建立后展示**独立授权确认页**（非仅登录表单），强调用户确认「当前登录请求来自可信客户端与设备」，再签发访问/续期凭证并通过 Custom URI Scheme 回传。技术路径采用宪章规定的 **Python 3.11 + FastAPI + SQLAlchemy 2 async** 与 **React 18 + Vite 6 + React Router + Tailwind**；JWT 签发与校验逻辑集中在后端统一安全模块（及可选反向代理 JWT 校验扩展），业务路由不重复实现校验。Web 侧包含：极简登录/SSO 入口、**居中卡片流授权页**（状态文案、用户头像/邮箱、确认/取消、设备安全提示）、成功态绿色对勾与自动倒计时关闭；失败或拦截深度链接时保留复制/重试兜底页。

## Technical Context

**Language/Version**: Python 3.11+（后端）；TypeScript 5.x（前端）  
**Primary Dependencies**: FastAPI、SQLAlchemy 2.x（AsyncSession）、Alembic、Pydantic v2、python-jose 或 PyJWT、passlib（bcrypt）或 argon2-cffi；uv（包管理）；React 18、Vite 6、React Router、Tailwind CSS  
**Storage**: SQLite（开发默认）/ MySQL 8+（生产建议）；用户、会话、刷新令牌哈希、授权请求（state）持久化  
**Testing**: pytest、pytest-asyncio、httpx（API）；前端 Vitest + Testing Library（按需）  
**Target Platform**: Linux/Windows 服务器容器；现代桌面浏览器（Chrome/Edge/Safari 近期版本）  
**Project Type**: Web 服务（后端 API + 服务端渲染或 SPA 前端，本计划采用 **前后端分离 SPA**）  
**Performance Goals**: 刷新令牌接口 p95 &lt; 500ms（内网）；授权页 FCP 可感知优于 2s（实验室）  
**Constraints**: 全站 HTTPS（生产）；`SESSION_SECRET` / `JWT_SECRET` 独立；密码仅存储强哈希；`state` 一次性且短期有效；重定向与 Custom URI 参数须白名单/绑定授权请求  
**Scale/Scope**: 中控平台身份底座；首期支持本地账号 + 可插拔 SSO 适配器接口；为 device-manage / skill-center 暴露统一 `user_id` 与 claims

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

权威来源：`.specify/memory/constitution.md`（CrewCentral 项目宪章）。

- [x] **固定技术栈**：方案与 Python 3.11+/FastAPI/SQLAlchemy 2.x（Async）+ uv、React 18/TS/Vite 6/React Router/Tailwind 一致。
- [x] **子路径部署**：统一可配置 `BASE_PATH`（如 `/woicrew`）；前端 `Vite base` + React `basename`、FastAPI `root_path` 或路由前缀、Session Cookie `path`、Nginx `location` 四者同一文档与配置源（见 `quickstart.md`）。
- [x] **双轨认证**：浏览器侧 HttpOnly Session 维持登录与授权页；客户端与 `/api/*` 使用 Bearer JWT；Auth Adapter（`/auth/login`、`/auth/callback`、`/auth/userinfo`、`/auth/logout`）在 `contracts/openapi.yaml` 与路由表中落地。
- [x] **契约优先**：`specs/001-auth-login/contracts/` 含 OpenAPI 与 UI 文案契约；数据模型见 `data-model.md`；Legacy 路由由 `ENABLE_LEGACY_ROUTES` 控制（默认关）。
- [x] **简化可扩展**：首期 Session 存 DB；刷新令牌可轮换；SSO 以适配器接口隔离；管理员列表可后接 IAM。
- [x] **命名空间与响应**：`{BASE_PATH}/auth/*`、`{BASE_PATH}/api/*`；面向客户端的 JSON 成功/失败采用 `{ "rc", "data"|"message" }`（与宪章一致）；管理/内部接口在合同中标注例外。
- [x] **安全与运维**：HTTPS、密钥轮换策略、管理废除接口 admin 鉴权、认证/废除结构化日志在数据模型与 API 设计中可追踪。

如需偏离上述 MUST，必须在下方 **Complexity Tracking** 表中记录理由与替代控制。

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-login/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

仓库当前无既有 `backend/` / `frontend/`，本功能落地建议结构：

```text
backend/
├── app/
│   ├── main.py                 # FastAPI 应用、路由挂载、中间件顺序（静态路由优先策略在实现时遵守宪章）
│   ├── core/
│   │   ├── config.py           # BASE_PATH、JWT、Session、SKIP_AUTH（仅开发）
│   │   └── security.py         # 密码哈希、JWT 签发/校验唯一入口
│   ├── db/
│   │   ├── session.py          # AsyncSession 工厂
│   │   └── base.py
│   ├── models/                 # SQLAlchemy 模型
│   ├── schemas/                # Pydantic
│   ├── api/
│   │   ├── deps.py             # get_current_user_jwt、require_admin
│   │   └── routes/
│   │       ├── auth_refresh.py # /api/v1/auth/refresh
│   │       └── admin_sessions.py
│   └── auth/
│       ├── routes.py           # /auth/* 页面重定向与回调
│       └── adapters/           # 本地账号 / SSO 插拔
├── alembic/
└── tests/
    ├── contract/
    └── integration/

frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # Router basename = BASE_PATH
│   ├── pages/
│   │   ├── LoginPage.tsx       # 极简登录 + SSO
│   │   ├── ConsentPage.tsx     # 授权确认（居中卡片 / Glassmorphism）
│   │   └── AuthSuccessPage.tsx # 绿色对勾 + 倒计时关页 / 深度链接 / 复制兜底
│   ├── components/
│   └── lib/                    # API 客户端、rc 解析
├── index.html
└── tests/
```

**Structure Decision**: 采用 **Option 2：前后端分离 Web 应用**。后端承载 `/auth/*` 重定向逻辑与 `/api/*` JSON；前端 SPA 负责登录页、**授权确认页**与成功/兜底页，通过 `fetch` 或表单提交与后端会话协同。桌面客户端仅打开 URL，不嵌入原生表单。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无宪章违规需登记；授权确认页为产品增量，不削弱 MUST 项。

## Post-Design Constitution Check (Phase 1 complete)

- [x] 契约、数据模型与路由命名空间已在 `contracts/` 与 `data-model.md` 对齐宪章。
- [x] 双轨认证与集中 JWT  enforcement 在结构与 `research.md` 决策中可追溯。
