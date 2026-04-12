---

description: "Task list for 004-download-center (Download 客户端发布中心)"

---

# Tasks: Download 客户端发布中心

**Input**: `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: `spec.md` 未强制 TDD；本清单不含强制契约/集成测试项。若后续补充测试策略，可在对应 User Story 下追加 `[P] [USn]` 测试任务。

**Organization**: 按 User Story 分组，便于独立实现与验收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: `US1` / `US2` / `US3`（仅 User Story 阶段任务）
- 描述中须含**确切仓库路径**

## Path Conventions

本仓库为 **Web app**：`backend/app/`、`frontend/src/`（与 `plan.md` 一致）。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 对齐契约与前端占位，避免后续大面积改路径。

- [x] T001 对照 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\contracts\openapi.yaml` 与 `contracts\ui-download-landing.md`，确认将实现使用的路径前缀为 `{BASE_PATH}/api/v1`（与 `backend\app\main.py` 现有 `/api/v1` 挂载一致）。
- [x] T002 [P] 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\releases-api.ts`，定义 `getDownloadContext()`、`getLatestRelease(currentVersion?: string)` 的 TypeScript 类型与 `fetch` 封装（可先抛 `501` 直至后端就绪）。
- [x] T003 [P] 创建目录 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\download\`（供 US2 组件落地）。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 数据库、模型、领域服务与路由骨架；**完成前不得开始 User Story 业务闭环**。

**⚠️ CRITICAL**: 迁移与模型必须先于 US1/US2/US3 的写读逻辑。

- [x] T004 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\alembic\versions\` 新增迁移文件，创建表 `client_release`、`client_release_asset`、`client_release_audit`（字段与约束对齐 `data-model.md`；资产表禁止存 BLOB）。
- [x] T005 [P] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\models\client_release.py`（`ClientRelease`：version、release_notes、changelog JSON、update_policy、status、published_at 等）。
- [x] T006 [P] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\models\client_release_asset.py`（`ClientReleaseAsset`：platform、download_url、file_name、md5、sha256、file_size_bytes）。
- [x] T007 [P] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\models\client_release_audit.py`（审计字段对齐 `data-model.md`）。
- [x] T008 更新 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\models\__init__.py`（若项目通过该文件聚合模型导出，确保新模型被导入以便 Alembic/metadata 一致）。
- [x] T009 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\schemas\releases.py`（创建/更新 body、资产子结构、`rc` 响应 data 形状与 `contracts/openapi.yaml` 对齐）。
- [x] T010 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\services\ua_platform.py`：从 `User-Agent`（及可选 `Sec-CH-UA-Platform`）推断 `windows|macos|linux|unknown`（见 `research.md`）。
- [x] T011 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\services\release_registry.py`：语义化版本比较、`get_latest_published()`、发布前校验「启用平台均有 url+md5+sha256」、禁止重复 published 版本号（规则见 `spec.md` / `research.md`）。
- [x] T012 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\releases_admin.py`，`APIRouter` 前缀 `/admin/releases`，可先挂健康检查占位。
- [x] T013 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\releases_public.py`，前缀建议 `/public/releases`（与 openapi 中 `download-context` 对齐）。
- [x] T014 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\releases_client.py`，前缀 `/releases` 或按 openapi 挂载到 `/api/v1/releases`。
- [x] T015 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\main.py` 中 `include_router` 注册上述三个路由（顺序：公共读接口按需在动态路由之前，遵循宪章「静态/明确路由优先」原则）。

宪章相关（已纳入上方任务）：`require_admin_session` 用于管理写接口；`BASE_PATH` 与 `SessionMiddleware` 的 `path` 已由现有 `main.py` 处理，联调时核对 `frontend` 的 `import.meta.env.BASE_URL` 与后端一致。

**Checkpoint**: 迁移可执行、模型可导入、路由可 import — User Story 实现可启动。

---

## Phase 3: User Story 1 - 发布条目管理与版本中心 (Priority: P1) 🎯 MVP

**Goal**: 管理员可维护发布记录、多平台资产与强制/可选策略；写入审计；数据可被后续下载页与升级接口读取。

**Independent Test**: 管理员登录后创建一条 **published** 发布，列表可见完整元数据；同版本号不可重复发布；缺平台 URL/哈希时提交失败。

### Implementation for User Story 1

- [x] T016 [US1] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\releases_admin.py` 实现发布 CRUD：`POST/GET/PATCH`（或等价）创建草稿、更新、发布、归档；全部使用 `Depends(require_admin_session)`。
- [x] T017 [US1] 在 `release_registry.py` 或路由层落实 FR-004：每个启用平台必须具备 `download_url`、`md5`、`sha256`；否则返回 `rc` 错误且不写入。
- [x] T018 [US1] 每次创建/更新/发布/归档写入 `ClientReleaseAudit`（actor 来自 `require_admin_session` 的 `User.id`，见 `deps.py`）。
- [x] T019 [US1] 实现 `update_policy`（`optional`/`forced`）与 `status` 状态机，与 `spec.md` 接受场景一致。
- [x] T020 [US1] 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\pages\admin\ReleasePublishPage.tsx`：表单含版本号、平台勾选、外链 URL、changelog 条目（type: new/fix）、Release Notes；调用 admin API。
- [x] T021 [US1] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\App.tsx` 注册路由 `/admin/releases`（或团队约定的一致 admin 前缀），并从现有管理入口增加导航链（若已有 admin 布局/菜单则接入）。

**Checkpoint**: 仅依赖本 Story 即可在后台完成一次合法发布并查审计。

---

## Phase 4: User Story 2 - 公网下载页智能推荐 (Priority: P1)

**Goal**: 公网 Landing：Hero Logo+Slogan、三平台下载按钮（.exe/.dmg/.deb）按 UA 高亮、Changelog（New/Fix）、展示 MD5/SHA256；未知 OS 时平等展示三按钮（见 `ui-download-landing.md`）。

**Independent Test**: 模拟 Windows/macOS/Linux UA 访问 `/download`，主按钮高亮正确；无 UA 时三按钮无错误高亮；展示最新 published 的 Release Notes/Changelog。

### Implementation for User Story 2

- [x] T022 [US2] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\releases_public.py` 实现 `GET /public/releases/download-context`（或 openapi 所载完整路径）：聚合最新 published、`recommended_platform`、`primary_asset`、`all_assets`、`changelog_entries`、`logo_url`/`slogan`（来源配置或发布记录字段，与 `plan.md` 一致）。
- [x] T023 [US2] 将 `ua_platform` 结果注入响应；缺失平台资产时标记为不可用且不在 `primary_asset` 中误选（见 `spec.md` Edge Cases）。
- [x] T024 [US2] 新增 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\pages\DownloadLandingPage.tsx`：极简 Landing 布局；大屏 Changelog 右侧、小屏下方（Tailwind 响应式）。
- [x] T025 [P] [US2] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\download\HeroSection.tsx`（Logo、Slogan）。
- [x] T026 [P] [US2] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\download\DownloadButtonGroup.tsx`（Windows/macOS/Linux 高亮与禁用态）。
- [x] T027 [P] [US2] 实现 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\components\download\ChangelogPanel.tsx`（`New`/`Fix` 标签；内容 **sanitize** 或纯文本，防 XSS，见 `research.md`）。
- [x] T028 [US2] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\releases-api.ts` 实现 `getDownloadContext` 对接 T022；在 `App.tsx` 注册 `/download` 路由挂载 `DownloadLandingPage`。
- [x] T029 [US2] 在落地页展示当前选中/推荐平台的 `md5` 与 `sha256`（一键复制）；**不**实现浏览器下载进度条动画（进度条仅客户端应用内，见 `ui-download-landing.md`）。

**Checkpoint**: 浏览器访问下载页与契约 `DownloadContextResponse` 一致；与 US1 联调需至少一条 published 数据（可由 US1 造数）。

---

## Phase 5: User Story 3 - 客户端静默更新检查 (Priority: P2)

**Goal**: `GET /api/v1/releases/latest`（路径以 `openapi.yaml` 为准）返回 `is_latest`、目标版本、`update_policy`、资产摘要与说明，供桌面客户端 Update Checker 使用。

**Independent Test**: 传入较低 `current_version`，返回可选/强制与下载信息；已最新时 `is_latest: true` 且不误导升级。

### Implementation for User Story 3

- [x] T030 [US3] 在 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\api\routes\releases_client.py` 实现 `GET /releases/latest`（挂载后完整路径为 `{BASE_PATH}/api/v1/.../latest`，与 openapi 一致），查询参数 `current_version` 可选。
- [x] T031 [US3] 使用 `release_registry` 比较语义化版本并设置 `update_policy`；响应包装为统一 `rc` 结构（`C:\Users\zhaocao\Documents\GitHub\CrewCentral\backend\app\schemas\rc.py`）。
- [x] T032 [US3] 更新 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\frontend\src\lib\releases-api.ts` 中 `getLatestRelease` 对接 T030，供将来管理端或调试页复用（可选）。

**Checkpoint**: 客户端可用 curl/httpx 验证三种场景（已最新、可选更新、强制更新）。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 契约、日志与 quickstart 闭环。

- [x] T033 [P] 核对并必要时修订 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\contracts\openapi.yaml` 与真实路由、字段名一致。
- [x] T034 为发布写操作与 `download-context` 缓存未命中/空发布添加结构化日志（`backend\app\main.py` 已有 logging 配置）。
- [x] T035 按 `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\quickstart.md` 执行一遍联调清单并修正文档与实现不一致处（仅改 `specs/004-download-center/` 下文档时保持最小 diff）。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** → **Phase 2** → **Phase 3 (US1)** → **Phase 4 (US2)**：US2 强依赖已发布数据时，需先完成 US1 或手工插入种子数据。
- **Phase 5 (US3)**：可在 Phase 2 后与 US1 并行开发逻辑，但**集成验证**建议在 US1 有 published 数据之后。

### User Story Dependencies

- **US1**：仅依赖 Phase 2。
- **US2**：依赖 Phase 2 + 推荐依赖 US1（造数）。
- **US3**：依赖 Phase 2 + 推荐依赖 US1（造数）。

### Parallel Opportunities

- T005–T007（模型）可并行。
- T025–T027（前端子组件）可并行。
- T002–T003 与 T004 可并行（前后端不同路径）。

---

## Parallel Example: User Story 2

```text
同时启动：T025 HeroSection.tsx、T026 DownloadButtonGroup.tsx、T027 ChangelogPanel.tsx
完成后由 T024 组装页面。
```

---

## Implementation Strategy

### MVP First（US1 + US2）

1. Phase 1 + Phase 2  
2. Phase 3（US1）— 后台可发布  
3. Phase 4（US2）— 公网下载页可用  
4. 停顿验收：SC-001/SC-002 相关场景  

### Incremental Delivery

1. Phase 5（US3）追加客户端升级检查，不阻塞下载页发布（P2）。  
2. Phase 6 收尾。  

---

## Summary（生成时统计）

| 指标 | 值 |
|------|-----|
| **生成文件** | `C:\Users\zhaocao\Documents\GitHub\CrewCentral\specs\004-download-center\tasks.md` |
| **任务总数** | 35（T001–T035） |
| **US1 任务数** | 6（T016–T021） |
| **US2 任务数** | 8（T022–T029） |
| **US3 任务数** | 3（T030–T032） |
| **Setup + Foundational + Polish** | 18（T001–T015，T033–T035） |
| **建议 MVP 范围** | Phase 1–4（US1+US2） |
| **格式** | 全部任务均为 `- [x] Tnnn ...` 且含文件路径；User Story 任务含 `[USn]` |

---

## Notes

- 管理接口**必须**服务端鉴权（`require_admin_session`），禁止仅前端隐藏。  
- 二进制仅 URL 引用，不入库。  
- 下载页路由建议固定为 `/download` 并在 `App.tsx` 中显式注册，避免被 `*` 兜底提前吞掉（若调整兜底策略，需与 `constitution.md`「路由顺序」一致）。  
