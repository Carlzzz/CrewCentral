# CrewCentral SDD 对齐说明（精简）

本仓库实现遵循 **规格驱动**：业务能力以 `specs/*/spec.md`、`plan.md`、`contracts/` 为准；全局约束见 **`.specify/memory/constitution.md`**。

## 与本次实现（Download Center）相关的要点

- **固定技术栈**：Python 3.11+ / FastAPI / SQLAlchemy 2.x Async；React 18 / TypeScript / Vite 6 / Tailwind。
- **路由与命名空间**：JSON API 位于 `{BASE_PATH}/api/v1/*`；浏览器 OAuth 在 `{BASE_PATH}/auth/*` 与现有模块一致。
- **双轨认证**：管理端发布接口使用 **Session Cookie + `require_admin_session`**；公网下载聚合与 `/releases/latest` 为**匿名可读**（契约见 `specs/004-download-center/contracts/openapi.yaml`）。
- **契约优先**：响应体 `rc` 包装与 OpenAPI 一致；禁止在管理写接口上仅依赖前端隐藏。
- **安全**：HTTPS 生产必选；Secrets 独立；发布审计写入 `client_release_audits`；落地页 Changelog 以 **纯文本** 渲染，避免 XSS。

更完整的背景与产品叙述见 `docs/WoiCrew Centra Control SDD.md`（若与宪章冲突，以 **`.specify/memory/constitution.md`** 为准）。
