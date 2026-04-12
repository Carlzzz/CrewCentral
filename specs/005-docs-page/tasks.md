---

description: "Task list for 005-docs-page (Docs 帮助文档系统)"

---

# Tasks: Docs 帮助文档系统（docs-page）

**Input**: `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\005-docs-page\`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: `spec.md` 未强制 TDD；本清单不含强制契约测试项。需要时可于各 User Story 下追加 `[P] [USn]` 测试任务。

**Organization**: 按 User Story（P1 阅读 → P2 管理 → P3 搜索）分组，便于独立交付与验收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: `US1` / `US2` / `US3`（仅 User Story 阶段任务）
- 描述中须含**确切仓库路径**

## Path Conventions

本仓库为 **Web app**：`backend/app/`、`frontend/src/`（与 `plan.md` 一致）。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 对齐契约、占位与路由策略，避免与现有 `*` 兜底冲突。

- [x] T001 对照 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\005-docs-page\contracts\openapi.yaml` 与 `contracts\ui-docs-reader.md`，确认 API 路径为 `{BASE_PATH}/api/v1/public/docs/*` 与 `{BASE_PATH}/api/v1/admin/docs/*`，且前端阅读壳为 `{BASE_PATH}/docs/*`。
- [x] T002 [P] 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\docs-api.ts`：`getDocTree`、`getDocPageBySlug`、`searchDocs` 的 TypeScript 类型与 `fetch` 封装（可先对接 mock 或待后端就绪）。
- [x] T003 [P] 创建目录 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\` 与占位导出（若需），供阅读页组件落地。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 数据库、模型、领域服务与路由骨架；**完成前不得开始 User Story 业务闭环**。

- [x] T004 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\alembic\versions\` 新增迁移，创建 `doc_pages` 表（字段对齐 `data-model.md`：`slug` 唯一、`nav_section`、`body_md`、`parent_id`、`sort_order`、`status` 等）。
- [x] T005 [P] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\models\doc_page.py`（`DocPage` ORM）。
- [x] T006 更新 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\models\__init__.py` 导出新模型。
- [x] T007 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\schemas\docs.py`（树节点、页面、搜索命中、创建/更新 body 与 `rc` data 形状）。
- [x] T008 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\services\doc_tree.py`：由扁平行构建嵌套树、按 `nav_section` 与 `sort_order` 排序。
- [x] T009 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\services\doc_search.py`：首期 SQLite **FTS5**（或 `body_plain` + 同步索引）；生产 PG 路径在代码中分支或抽象 `SearchBackend`（见 `research.md`）。
- [x] T010 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\docs_public.py`，`APIRouter` 前缀 `/public/docs`，实现 `GET /tree` 与 `GET /pages/{slug}`（仅 `published` 对匿名可见）。
- [x] T011 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\docs_admin.py`，前缀 `/admin/docs`，占位 `POST/GET/PATCH/DELETE`（后续 US2 补全），全部 `Depends(require_admin_session)`。
- [x] T012 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\main.py` 中 `include_router` 注册 `docs_public` 与 `docs_admin`（顺序：**公共静态路径优先**，避免被动态路由误吞）。

宪章相关：管理写接口必须服务端鉴权；`rc` 包装使用 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\schemas\rc.py`。

**Checkpoint**: 迁移可执行、模型可导入、公开 API 可返回空树/404。

---

## Phase 3: User Story 1 - 读者按 slug 阅读与三栏体验 (Priority: P1) 🎯 MVP

**Goal**: 匿名访问文档页；**三栏布局**（左分区树、中 Markdown、右 TOC）；代码高亮与复制；非衬线字体与主题切换（见 `ui-docs-reader.md`）。

**Independent Test**: 种子数据下打开 `/docs/...` 可见三栏、TOC 锚点、代码块复制；无登录。

### Implementation for User Story 1

- [x] T013 [US1] 完善 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\docs_public.py`：`GET /pages/{slug}` 返回 `body_md` + `title` + `nav_section`，slug 未发布返回 `rc` 错误；与 `data-model.md` 单段 slug 策略一致（实现时锁死一种）。
- [x] T014 [US1] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\docs-api.ts` 将 `getDocTree`、`getDocPageBySlug` 对接 T010/T013。
- [x] T015 [US1] 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\pages\DocsReaderLayout.tsx`：三栏 Grid + `max-w` 阅读宽度（GitBook/Stripe 式留白），集成 **深色/浅色**（`dark` class + `localStorage`，见 `research.md`）。
- [x] T016 [P] [US1] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\DocsTopBar.tsx`：全局搜索框占位（US3 接线）、主题切换、窄屏菜单触发器。
- [x] T017 [P] [US1] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\DocsSidebarTree.tsx`：四大分区（快速入门 / 设备接入 / 技能开发 / API 参考）分组 + 树展开/当前 slug 高亮；`md` 下抽屉化。
- [x] T018 [P] [US1] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\DocsMarkdown.tsx`：`react-markdown` + `remark-gfm` + **rehype-sanitize**；标题生成稳定 `id` 供 TOC；**非衬线**字体栈。
- [x] T019 [P] [US1] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\DocsToc.tsx`：从标题或 AST 提取 `TocItem`，右侧锚点滚动。
- [x] T020 [P] [US1] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\CodeBlockWithCopy.tsx`：Shiki 或 highlight.js + **复制** 按钮。
- [x] T021 [US1] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\App.tsx` 注册 `/docs` 与 `/docs/*` **显式路由**，且位于 `path="*"` **之前**；`DocsReaderLayout` 使用 `useParams` 读取 slug。

**Checkpoint**: 仅 US1 即可演示「类 GitBook」阅读闭环（依赖种子数据）。

---

## Phase 4: User Story 2 - 管理员树与双栏 Markdown (Priority: P2)

**Goal**: `docs_admin` 完整 CRUD、拖拽调序、双屏编辑；slug 校验与保留字冲突；发布后前台可见。

**Independent Test**: 管理员登录后增删改、调层级、发布；前台读者看到更新。

### Implementation for User Story 2

- [x] T022 [US2] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\docs_admin.py` 实现创建/更新/删除/列表/发布；`slug` 唯一与保留路径校验；父节点删除策略在实现中**写死一种**（禁止删有子 **或** 级联，与 `data-model.md` 注释一致）。
- [x] T023 [US2] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\services\doc_search.py`（或独立任务）在文档保存时同步 **正文纯文本** 与 FTS 索引（若已采用 FTS 表）。
- [x] T024 [US2] 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\pages\admin\DocsEditorPage.tsx`：左侧树（`@dnd-kit` 或等价）拖拽、右侧 **Markdown 双栏**（编辑 + 预览，复用 `DocsMarkdown` 安全管线）。
- [x] T025 [US2] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\App.tsx` 注册 `/admin/docs`；在现有管理入口（如 `SkillHubPage` 或主导航）增加指向 **文档管理** 的链接。
- [x] T026 [US2] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\docs-api.ts` 补充管理端 `postJson`/`patchJson`/`delete` 封装（与 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\api.ts` 模式一致）。

**Checkpoint**: 管理后台可独立完成内容闭环，无需 US3。

---

## Phase 5: User Story 3 - 全文搜索 (Priority: P3)

**Goal**: `GET /api/v1/public/docs/search?q=` 与顶栏搜索 UI、结果页或下拉列表跳转 slug。

**Independent Test**: 多文档关键词命中；无结果空状态。

### Implementation for User Story 3

- [x] T027 [US3] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\docs_public.py` 实现 `GET /search`，参数 `q`、`limit`，返回 `SearchHit[]`（`rc` 包装）；空查询返回友好 `rc` 提示。
- [x] T028 [US3] 更新 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\docs\DocsTopBar.tsx` 与 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\docs-api.ts`：搜索提交 → 结果列表或跳转 `/docs/search?q=` 页面（与 `ui-docs-reader.md` 一致）。

**Checkpoint**: 搜索可独立验收。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 契约、日志、文档与质量闸。

- [x] T029 [P] 核对并修订 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\005-docs-page\contracts\openapi.yaml` 与真实路由、字段名一致。
- [x] T030 为管理写操作与搜索失败路径添加结构化日志（`backend\app\main.py` 已有 logging 配置）。
- [x] T031 按 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\005-docs-page\quickstart.md` 执行联调并修正 `specs/005-docs-page/` 下文档最小差异。
- [x] T032 [P] 在 `backend` 目录运行 `ruff check app` 与 `frontend` 运行 `npm run build`，修复本特性引入的问题。

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → Phase 3（US1）→ Phase 4（US2）→ Phase 5（US3）→ Phase 6。  
- **US3** 依赖 **T009/T023** 索引与 **T010** 公开路由骨架；**US2** 可在 Phase 2 后与 US1 并行开发后端，但前台联调建议 **US1 阅读壳** 已就绪。

### User Story Dependencies

- **US1**：依赖 Phase 2。  
- **US2**：依赖 Phase 2；与 US1 并行开发时需注意 **App 路由顺序** 与 `docs-api` 契约。  
- **US3**：依赖 Phase 2 + 索引同步（T023/T009）。

### Parallel Opportunities

- T005 与 T007 可并行（模型 vs schema）。  
- T016–T020（阅读 UI 子组件）可并行。  
- T002–T003 与 T004 可并行（前后端）。

---

## Implementation Strategy

### MVP First（US1）

1. Phase 1 + Phase 2  
2. Phase 3（US1）+ 种子数据  
3. 停顿验收 SC-001  

### Incremental Delivery

1. Phase 4（US2）— 运营闭环  
2. Phase 5（US3）— 搜索  
3. Phase 6 — 收尾  

---

## Summary

| 指标 | 值 |
|------|-----|
| **生成文件** | `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\005-docs-page\tasks.md` |
| **任务总数** | 32（T001–T032） |
| **US1 任务数** | 9（T013–T021） |
| **US2 任务数** | 5（T022–T026） |
| **US3 任务数** | 2（T027–T028） |
| **Setup + Foundational + Polish** | 16（T001–T012，T029–T032） |
| **建议 MVP 范围** | Phase 1–3（US1），含种子数据 |

---

## Notes

- 管理接口**禁止**仅前端隐藏；必须 `require_admin_session`（或等价）。  
- Markdown **必须**消毒后再渲染，避免 XSS。  
- `/docs` 与 `/docs/*` 路由注册顺序见 `ui-docs-reader.md` 与宪章「静态优先」。
