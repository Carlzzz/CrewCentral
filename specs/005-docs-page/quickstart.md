# Quickstart: Docs 帮助文档系统

## 前置

- 仓库 `backend/`、`frontend/` 与既有 **Base Path** 一致。  
- 四一致：前端 `basename`、FastAPI 路由前缀、Session Cookie `Path`、Nginx 转发（见宪章）。

## 本地联调

1. 应用迁移，创建 `doc_pages`（及可选 FTS 辅助结构）。  
2. 启动后端，确认 `{BASE_PATH}/api/v1/public/docs/tree` 返回 `rc:0`。  
3. 种子数据：在 `backend/` 执行 `uv run python -m scripts.seed_doc_pages`（或手工为四个 `nav_section` 各至少一篇 `published` 文档）。  
4. 启动前端，访问 `{BASE_PATH}/docs`，检查三栏、主题切换、复制代码、TOC 锚点。  
5. 顶栏搜索关键词，结果跳转 slug 正确。  
6. 管理员登录 `{BASE_PATH}/admin/docs`（或约定路径），创建草稿 → 发布 → 前台可见。

## 路由顺序提醒

- 在 `App.tsx` 中 **`/docs` 与 `/docs/...` 显式路由** 应排在兜底 `*` 之前。  
- 后端同理：**`/api/v1/public/docs/*`** 先于易冲突的动态路由。

## 契约

- `contracts/openapi.yaml`  
- `contracts/ui-docs-reader.md`  
