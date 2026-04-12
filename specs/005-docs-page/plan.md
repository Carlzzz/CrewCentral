# Implementation Plan: Docs 帮助文档系统（docs-page）

**Branch**: `005-docs-page` | **Date**: 2026-04-07 | **Spec**: `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\005-docs-page\spec.md`  
**Input**: Feature specification + 设计补充：阅读体验对标 **GitBook / Stripe 文档**；**三栏布局**（左导航树、中 Markdown、右锚点大纲）；顶部全站搜索；非衬线字体、代码块「复制」、深/浅色主题。

## Summary

建设独立 **Docs** 模块：主库存储文档树与 Markdown 正文，**slug 唯一** 对外路由；**公开只读**（Session 仅管理端）；**全文搜索**（开发 SQLite FTS5，生产 PostgreSQL `tsvector` 或等价，见 `research.md`）。前端阅读壳采用 **三栏**：左侧按 **四大分区**（快速入门、设备接入、技能开发、API 参考）组织的可展开目录树，中间正文（代码高亮 + 复制），右侧 **Heading 锚点 TOC**；顶栏含 **全局搜索**、**主题切换**。后台为树拖拽 + Markdown 双栏编辑器（规格已有）。

## Technical Context

**Language/Version**: Python 3.11+（后端）；TypeScript 5.x（前端）  
**Primary Dependencies**: FastAPI、SQLAlchemy 2.x Async、Alembic、Pydantic v2；React 18、Vite 6、React Router、Tailwind CSS；Markdown 管线（`remark`/`rehype` 族或等价，见 research）  
**Storage**: 文档主档与搜索索引字段存主库（SQLite 开发 / PostgreSQL 生产建议）；正文为 TEXT，**不**用富文本 BLOB  
**Testing**: pytest、httpx；前端 `tsc` + build  
**Target Platform**: 浏览器文档站 + 管理端；响应式窄屏下侧栏抽屉化  
**Project Type**: Web application（backend + frontend）  
**Performance Goals**: 公开页首屏可感知加载 &lt; 3s（常载）；搜索 p95 &lt; 1s（中等数据量，见 SC-002）  
**Constraints**: 宪章 `{BASE_PATH}/api/*`；`rc` 响应；Markdown **XSS 消毒**；静态路由 `/docs` 先于通配 slug；管理写接口 **require_admin_session**  
**Scale/Scope**: 首期数百篇级文档；四大导航分区 + 可扩展子节点  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

权威来源：`.specify/memory/constitution.md`。

- [x] **固定技术栈**：Python/FastAPI/SQLAlchemy + React/TS/Vite/Tailwind；依赖 uv 管理。  
- [x] **子路径部署**：阅读路由 `{BASE_PATH}/docs/*`、API `{BASE_PATH}/api/v1/docs/*` 与前端 `basename`、Cookie `Path`、Nginx 一致；在 `quickstart.md` 写明。  
- [x] **双轨认证**：管理端 Session + admin；公开 `GET` 树/页/搜索 **匿名**；契约标注。  
- [x] **契约优先**：`contracts/openapi.yaml` + `contracts/ui-docs-reader.md`。  
- [x] **简化可扩展**：首期单表/少表 + FTS 抽象；未来可迁 Meilisearch 等，边界见 `research.md`。  
- [x] **命名空间与响应**：API 挂在 `/api/v1`；`rc` 包装。  
- [x] **安全与运维**：管理鉴权、Markdown 安全渲染、HTTPS、审计（可选后续任务）。  

## Project Structure

### Documentation (this feature)

```text
specs/005-docs-page/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── ui-docs-reader.md
└── tasks.md             # /speckit.tasks
```

### Source Code (repository root)

```text
backend/
└── app/
    ├── api/routes/
    │   ├── docs_public.py
    │   └── docs_admin.py
    ├── models/
    │   └── doc_page.py
    ├── services/
    │   ├── doc_tree.py
    │   ├── doc_search.py
    │   └── markdown_safe.py
    └── schemas/
        └── docs.py

frontend/
└── src/
    ├── pages/
    │   ├── DocsReaderLayout.tsx
    │   └── admin/
    │       └── DocsEditorPage.tsx
    ├── components/docs/
    │   ├── DocsTopBar.tsx
    │   ├── DocsSidebarTree.tsx
    │   ├── DocsMarkdown.tsx
    │   ├── DocsToc.tsx
    │   └── CodeBlockWithCopy.tsx
    └── lib/
        └── docs-api.ts
```

**Structure Decision**：沿用仓库 `backend/app`、`frontend/src`；阅读页独立 Layout 与 `/docs/*` 路由；**路由注册顺序**在 `App.tsx`/`main.py` 保证 `/docs` 与静态路径不被通配吞掉。

## Complexity Tracking

无宪章例外，本表留空。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|

## Post-Design Constitution Check

- [x] `research.md` 覆盖 FTS、Markdown 安全、主题与排版。  
- [x] `data-model.md` 定义 `DocPage`、分区、slug、状态。  
- [x] `contracts/openapi.yaml` 与 `ui-docs-reader.md` 对齐三栏与搜索。  
- [x] `quickstart.md` 含 Base Path 四一致与联调步骤。  
