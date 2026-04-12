# Data Model: Docs 帮助文档系统

## Entity: DocPage（文档节点 / 页面）

| Field | Type | Notes |
|-------|------|--------|
| id | UUID PK | 内部主键，不对外暴露为 URL |
| slug | string | **全局唯一**，URL 路径段，建议 `^[a-z0-9]+(?:-[a-z0-9]+)*$` 或含 `/` 的多段路径策略二选一（契约中锁死一种） |
| title | string | 展示标题 |
| body_md | text | Markdown 源 |
| nav_section | enum | `getting_started` \| `device` \| `skill_dev` \| `api_ref` 映射 UI：**快速入门 / 设备接入 / 技能开发 / API 参考** |
| parent_id | FK nullable | 父节点；`null` 表示根（可与 nav_section 根占位配合） |
| sort_order | int | 同级排序，升序 |
| status | enum | `draft` \| `published` |
| published_at | datetime nullable | |
| updated_at / created_at | datetime | |

**Rules**:

- `slug` 唯一；与系统保留路径（如 `docs`、`admin`、`api`）冲突时拒绝。  
- 仅 `published` 对匿名读者可见；`draft` 仅管理端。  
- 删除父节点策略：实施时选择 **级联** 或 **禁止删有子**（契约/任务中写死一种）。

## Entity: DocSearchDocument（可选 / 与 FTS 同库）

若使用独立 FTS 表：存储 `doc_page_id`、`title`、`body_plain`（从 MD 剥离的纯文本用于索引）及 FTS 引擎所需列；与 `DocPage` 同事务或异步重建索引（首期可同步）。

## View: DocTreeNode（API 输出形状）

递归树节点：`{ id, slug, title, nav_section?, children: [...] }`（`id` 可仅用于展开状态；对外跳转以 `slug` 为主）。

## View: SearchHit

`{ slug, title, snippet?, rank? }`

## View: TocItem（前端由 Markdown AST 或渲染后标题生成）

`{ id: string, text: string, depth: 1..6 }` — 与正文 `h*` 的 `id` 一致以便锚点滚动。
