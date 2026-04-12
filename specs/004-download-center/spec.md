# Feature Specification: Download 客户端发布中心（Download Center）

**Feature Branch**: `004-download-center`  
**Created**: 2026-04-07  
**Status**: Draft  
**Input**: User description: "/speckit.specify 功能：Download 客户端发布中心 (short name: download-center)"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - 发布条目管理与版本中心 (Priority: P1)

作为发布管理员，我可以创建并维护客户端版本发布记录，包含版本号、更新日志、各平台下载地址与文件哈希，并标记强制更新或可选更新。

**Why this priority**: 没有可信发布元数据，下载页推荐与客户端升级检查都无法成立。

**Independent Test**: 通过后台发布表单创建一个新版本后，可在后台列表看到完整元数据，且同版本号不能重复发布。

**Acceptance Scenarios**:

1. **Given** 管理员已登录发布后台，**When** 提交合法版本元数据，**Then** 系统保存该发布记录并可被后续下载页与升级接口读取。  
2. **Given** 某发布缺失某平台下载 URL 或哈希，**When** 提交发布，**Then** 系统返回校验错误且不写入记录。  
3. **Given** 管理员将发布标记为“强制更新”，**When** 保存成功，**Then** 发布记录中可明确区分强制/可选状态。

---

### User Story 2 - 公网下载页智能推荐 (Priority: P1)

作为最终用户，我访问公网下载页时可以自动看到与我系统匹配的“立即下载”主按钮，并可查看其他平台入口与最新 Release Notes。

**Why this priority**: 这是最核心的对外入口，直接决定下载转化率与发布触达效率。

**Independent Test**: 分别用 Windows/macOS/Linux 的浏览器访问下载页，主按钮推荐平台正确，且可见其他平台下载链接与最新发布说明。

**Acceptance Scenarios**:

1. **Given** 访问者来自 Windows 浏览器，**When** 打开下载页，**Then** 主按钮展示 Windows 下载入口并带对应 OS 图标。  
2. **Given** 访问者系统无法被识别，**When** 打开下载页，**Then** 默认展示通用下载入口并提供三平台备选链接。  
3. **Given** 已存在最新发布记录，**When** 用户浏览下载页，**Then** 页面显示该版本的 Release Notes 摘要。

---

### User Story 3 - 客户端静默更新检查 (Priority: P2)

作为客户端 Update Checker，我可以通过 `/releases/latest` 查询最新可用版本与更新策略，并据此决定是否提示升级或强制更新。

**Why this priority**: 客户端升级体验依赖该接口，但其价值建立在“发布管理 + 下载页”已可用基础上。

**Independent Test**: 老版本客户端调用 `/releases/latest` 后，能根据返回的版本号和强制标志正确判断“无需更新 / 可选更新 / 强制更新”。

**Acceptance Scenarios**:

1. **Given** 客户端当前版本落后且最新发布为可选更新，**When** 调用 `/releases/latest`，**Then** 返回新版本信息并标记为可选更新。  
2. **Given** 客户端当前版本落后且最新发布为强制更新，**When** 调用 `/releases/latest`，**Then** 返回强制更新标志与目标版本。  
3. **Given** 客户端已是最新版本，**When** 调用 `/releases/latest`，**Then** 返回“已最新”语义且不触发升级动作。

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- 最新版本仅发布了部分平台安装包时，下载页如何展示缺失平台并避免错误推荐。  
- User-Agent 伪造或信息不完整时，系统如何回退为通用下载策略。  
- 两个发布记录时间接近且版本号异常（如倒退）时，系统如何确定“latest”。  
- 某平台下载 URL 临时失效时，系统如何反馈并避免继续推荐失效链接。  
- 强制更新策略变更时，老客户端缓存过期策略如何保证尽快感知。  
- 发布日志内容包含恶意脚本片段时，展示层如何安全渲染。

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: 系统 MUST 支持维护客户端发布记录，至少包含版本号、更新日志、平台下载地址、文件哈希、发布时间、发布状态。  
- **FR-002**: 系统 MUST 明确区分“强制更新”与“可选更新”发布策略，并在查询结果中可被客户端直接消费。  
- **FR-003**: 系统 MUST 提供后台发布表单，支持版本号输入、平台勾选、外部链接或文件上传、更新日志编辑。  
- **FR-004**: 系统 MUST 校验发布数据完整性：每个启用平台必须有可用下载地址与对应哈希值。  
- **FR-005**: 系统 MUST 提供公网下载落地页，并根据访问者 User-Agent 推荐对应 OS 的主下载按钮。  
- **FR-006**: 系统 MUST 在下载页展示其他平台的可选下载入口与最新版本 Release Notes。  
- **FR-007**: 系统 MUST 提供 `/releases/latest` 能力，返回客户端判断是否升级所需的最小信息（目标版本、更新类型、更新说明、下载入口）。  
- **FR-008**: 系统 MUST 禁止将二进制安装包存储在业务关系型数据库中，安装包仅通过对象存储或静态文件服务地址引用。  
- **FR-009**: 系统 MUST 保证对外下载地址具备稳定分发能力（可观测的可用性与合理带宽保障）。  
- **FR-010**: 系统 MUST 对后台发布与修改操作记录审计信息（操作者、时间、变更内容）。  
- **FR-011**: 系统 MUST 保持与现有部署基路径一致，确保下载页、后台发布页与发布 API 在统一路径策略下可访问。  
- **FR-012**: 系统 MUST 明确范围边界：不负责 CI/CD 自动打包，不负责 P2P 安装包加速。

### Key Entities *(include if feature involves data)*

- **发布记录（Release）**: 表示一次客户端版本发布，包含版本号、更新日志、更新时间、发布类型（强制/可选）与状态。  
- **平台资产（Release Asset）**: 表示某发布在某平台下的可下载安装包元数据，包含平台类型、下载 URL、哈希值、文件大小（可选）。  
- **下载页推荐视图（Download Recommendation）**: 面向访问者的组合结果，包含推荐平台主按钮、备用平台链接、最新发布说明。  
- **升级检查结果（Update Check Result）**: 面向客户端 `/releases/latest` 的响应聚合，包含目标版本、是否强制、对比依据与下载入口。  
- **发布审计记录（Release Audit）**: 记录后台发布创建、编辑、下线等动作，用于合规追踪。

## Constitution Check *(mandatory)*

*对照 `.specify/memory/constitution.md` 自证；与宪章 MUST 冲突时不得静默忽略，须在 Assumptions 或计划中写明例外与替代控制。*

- [x] **固定技术栈**：本特性仅描述业务能力，不引入新栈外技术。  
- [x] **子路径部署**：下载页、后台发布页与 `/releases/latest` 将在统一 Base Path 策略下落地。  
- [x] **双轨认证**：后台发布管理为浏览器管理场景；客户端升级检查为客户端 API 场景。  
- [x] **契约优先**：发布元数据、下载推荐、升级检查结果均要求形成可验证契约。  
- [x] **领域约束**：覆盖版本中心、下载 URL、更新策略等宪章相关约束。  
- [x] **安全与运维**：要求 HTTPS、下载可用性保障、发布审计与数据安全边界。

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: 95% 的发布操作可在 5 分钟内完成“填写表单到发布记录可见”的闭环。  
- **SC-002**: 下载落地页对三类主流系统（Windows/macOS/Linux）的推荐准确率达到 95% 以上。  
- **SC-003**: 客户端升级检查请求中，99% 可在 2 秒内返回升级判断结果。  
- **SC-004**: 对标记为强制更新的版本，100% 的旧版本客户端在下一次检查中收到“强制更新”标志。  
- **SC-005**: 上线 30 天内，由下载链接错误或平台错配导致的用户反馈率低于 2%。

## Assumptions

- 下载中心模块在业务域上独立，但后台管理仍沿用现有管理身份体系。  
- 首期支持桌面平台（Windows/macOS/Linux），移动端安装包分发不在本期范围。  
- 下载 URL 可由对象存储或静态文件服务提供，带宽与可用性由部署侧保障。  
- `/releases/latest` 的消费方是现有客户端 Update Checker，客户端已具备版本比较能力。  
- 非目标中的 CI/CD 自动打包与 P2P 加速在本期均不实现。  
