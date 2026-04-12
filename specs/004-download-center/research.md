# Research: Download 客户端发布中心

## 1. 公网落地页 OS 推荐（User-Agent）

- **Decision**: 服务端或前端根据 `navigator.userAgent` / `Sec-CH-UA-Platform`（若可用）推断 `windows | macos | linux | unknown`；**unknown** 时主 CTA 为「选择你的平台」三按钮并列，不强行高亮单一平台。  
- **Rationale**: 与 spec FR-005/FR-006 一致；伪造 UA 时回退为通用策略，避免错误推荐。  
- **Alternatives considered**: 纯 IP Geo — 与桌面 OS 无关，弃用。

## 2. 「最新版本」语义（latest）

- **Decision**: 「最新」= 按 **语义化版本** 比较后的最大版本，且发布状态为 **已发布**；若版本号非法或倒退，拒绝写入或需人工确认（实现时二选一并在 API 文档写明）。  
- **Rationale**: 满足 edge case「版本倒退」与 SC-004。  
- **Alternatives considered**: 仅按发布时间排序 — 易被错误操作污染。

## 3. 二进制与存储

- **Decision**: 安装包仅存 **URL + 哈希 + 元数据**；**禁止** BLOB 入关系库（FR-008）。  
- **Rationale**: 宪章与 spec 明确。  
- **Alternatives considered**: 分片存 DB — 违反 FR-008。

## 4. `/releases/latest` 与客户端

- **Decision**: 匿名 `GET`，请求可带 `current_version` query；响应含目标版本、强制/可选、各平台下载入口摘要、**与落地页一致的 Release Notes 摘要**。  
- **Rationale**: P2 用户故事与 SC-003。  
- **Alternatives considered**: 仅返回版本号 — 不足以驱动客户端 UI。

## 5. Changelog 与展示安全

- **Decision**: 后台以 **Markdown 受限子集** 或纯文本存储；前端用 **sanitize** 后渲染，或仅展示纯文本段落；条目类型枚举 **new | fix**（及可选 `improvement`）用于 UI 标签。  
- **Rationale**: Edge case「恶意脚本片段」。  
- **Alternatives considered**: 原样 `dangerouslySetInnerHTML` — 不安全。

## 6. 校验码（MD5 / SHA256）

- **Decision**: 每平台资产同时存 **md5** 与 **sha256**（或至少 sha256 + 可选 md5）；落地页在次要信息区展示，支持一键复制。  
- **Rationale**: 用户信任与完整性校验。  
- **Alternatives considered**: 仅 SHA256 — 可接受，但 spec 与用户要求双显。

## 7. 下载进度条动画（平台内升级）

- **Decision**: **不属于** 纯浏览器落地页范围；由 **桌面客户端** 在下载更新包时展示进度条动画；若未来提供「Web 内嵌升级」页面，可复用同一进度语义。规格在 `ui-download-landing.md` 中标注为 **Client-only**。  
- **Rationale**: 与「浏览器访问下载页」场景分离。  
- **Alternatives considered**: 在落地页模拟假进度 — 误导用户。

## 8. Landing 视觉与信息架构

- **Decision**: 单栏居中 **Hero**（Logo + Slogan）→ **主下载区**（三平台按钮，当前 OS 高亮）→ **Changelog**（右侧栏大屏 / 下方窄屏）→ 页脚含校验码与版本号。风格 **极简、大方**，留白充足。  
- **Rationale**: 用户明确「消除安装焦虑」。  
- **Alternatives considered**: 多 Tab 切换平台 — 增加认知负担。
