# Research: Docs 帮助文档系统（005-docs-page）

## 1. 全文搜索实现

- **Decision**: 开发环境使用 **SQLite FTS5**（虚拟表或与主表同步的 `content` 字段 + FTS 索引）；生产环境使用 **PostgreSQL** 时采用 **`tsvector` 生成列 + GIN 索引**（`to_tsvector('simple' 或 'english' + chinese 插件若部署允许)`）；若未来单机检索不足再引入专用搜索引擎。  
- **Rationale**: 满足 spec「无 ES 时可用 PG 全文检索」；与宪章主库技术一致；避免首期运维负担。  
- **Alternatives considered**: Meilisearch/Elastic — 能力强但增加组件与同步复杂度（保留为扩展点）。

## 2. Markdown 渲染与安全

- **Decision**: 服务端存 **原始 Markdown**；前端用 **react-markdown** + **remark-gfm**，经 **rehype-sanitize**（或等价 allowlist）后再 **rehype-slug** / 自定义为标题生成稳定 `id` 供右侧 TOC 锚点跳转。  
- **Rationale**: 防 XSS 与脚本注入；锚点与 Stripe/GitBook 式右侧大纲一致。  
- **Alternatives considered**: 仅 `dangerouslySetInnerHTML` — 不安全。

## 3. 代码高亮与「复制」

- **Decision**: 使用 **Shiki** 或 **highlight.js**（与 bundler 体积权衡二选一）；每个 fenced code block 外包一层客户端组件，提供 **「复制」** 按钮（`navigator.clipboard`）。  
- **Rationale**: 满足 UI 细节；阅读体验对标 Stripe/GitBook。  
- **Alternatives considered**: 纯 `<pre>` 无高亮 — 不满足 spec。

## 4. 三栏布局与响应式

- **Decision**: 桌面 **CSS Grid / Flex** 固定三栏（左 260–300px、中 `minmax(0,1fr)`、右 200–260px）；**`md` 以下** 左侧改为 **抽屉**，右侧 TOC 可折叠至正文上方 tabs 或抽屉。  
- **Rationale**: spec FR-005 与 GitBook 类体验；移动端不强制三栏并排。  
- **Alternatives considered**: 始终三栏挤压 — 可读性差。

## 5. 导航分区（快速入门 / 设备接入 / 技能开发 / API 参考）

- **Decision**: 在数据模型增加 **`nav_section`** 枚举**（四值之一）**，根节点或每篇文档归属一分区；左侧树按 **分区 → 树** 分组展示（可折叠分区标题）。  
- **Rationale**: 与产品信息架构一致；避免纯深度嵌套难扫视。  
- **Alternatives considered**: 仅深度树无分区标签 — 弱于设计输入。

## 6. 深色 / 浅色主题

- **Decision**: **Tailwind `dark` class**（`class` 策略）+ **`localStorage` 持久化** 用户偏好；根节点 `html` 切换。系统偏好 `prefers-color-scheme` 作为首次默认。  
- **Rationale**: 实现快、与现有栈一致。  
- **Alternatives considered**: 仅 CSS 变量单主题 — 不满足需求。

## 7. 字体

- **Decision**: 全站阅读区使用 **系统非衬线栈**（如 `ui-sans-serif, system-ui, …`），必要时引入 **Inter** 或 **Noto Sans SC** 其一（Google Fonts 或自托管二选一，实施任务定）。  
- **Rationale**: 对标现代文档站、中文可读。  

## 8. 阅读体验（GitBook / Stripe）

- **Decision**: 中间栏 **最大宽度限制**（如 `max-w-3xl` 居中）、**行高与段落间距**略大于默认控制台 UI；链接使用明显 hover；表格横向滚动容器。  
- **Rationale**: 「侧重阅读体验」的设计输入落实在布局与排版 tokens。  
