# Feature Specification: Windows AD 认证集成

**Feature Branch**: `006-ad-auth`
**Created**: 2026-07-03
**Status**: Draft
**Input**: 集成公司 Windows AD，实现 AD 账号密码登录、首次登录自动同步用户信息、管理员手动批量同步 AD 用户。

## User Scenarios & Testing

### User Story 1 - 使用 AD 账号密码登录（P1）

员工在浏览器中打开中控网页，选择「企业 AD 登录」，输入 Windows AD 账号和密码完成登录。系统验证成功后自动建立会话。

**Why this priority**: 这是 AD 集成的核心能力，所有的同步和 SSO 都依赖此基础。

**Acceptance Scenarios**:

1. **Given** AD 服务器可连通且用户输入正确的 AD 账号密码，**When** 点击登录，**Then** 登录成功，跳转到首页，会话中记录用户身份。
2. **Given** AD 账号或密码错误，**When** 点击登录，**Then** 显示「账号或密码错误」，不泄露 AD 服务器内部信息。
3. **Given** AD 服务器不可达，**When** 点击登录，**Then** 显示「认证服务暂时不可用，请联系管理员」，5 秒内返回，不阻塞页面。
4. **Given** 本地已有相同邮箱的账号，**When** 首次通过 AD 登录，**Then** 自动绑定 AD 身份到已有账号，不创建重复用户。

### User Story 2 - 首次登录自动同步用户信息（P1）

员工首次通过 AD 登录时，系统自动从 AD 拉取用户属性（姓名、邮箱、部门等），在本地创建或更新用户记录。

**Why this priority**: 省去管理员手动创建账号的工作，保证本地用户信息与 AD 一致。

**Acceptance Scenarios**:

1. **Given** AD 中存在的用户首次登录，**When** 认证成功，**Then** 本地 users 表自动创建记录，email 从 mail 同步，display_name 从 displayName 同步。
2. **Given** 已存在的本地用户再次通过 AD 登录，**When** 认证成功，**Then** 更新 display_name 等可变更字段，不覆盖 is_admin 等本地管理字段。

### User Story 3 - 管理员批量同步 AD 用户（P2）

管理员在中控后台触发批量同步，将 AD 中指定 OU 或组的用户同步到本地 users 表。

**Why this priority**: 方便管理员在新员工入职或组织调整时快速更新用户列表。

**Acceptance Scenarios**:

1. **Given** 管理员调用同步接口并指定搜索范围，**When** 执行同步，**Then** 系统分页拉取 AD 用户列表，逐个检查/创建/更新本地账号，返回同步统计（新增 X、更新 Y、跳过 Z）。
2. **Given** 同步过程中 AD 连接中断，**When** 发生异常，**Then** 已处理的部分不回滚（至少幂等可重试），错误信息记录日志并返回给管理员。

### User Story 4 - Kerberos/NTLM 透明 SSO（P3，二期）

域内机器访问中控网页时，浏览器自动完成 Kerberos 票据协商，无需输入账号密码直接登录。

**Why this priority**: 最佳用户体验，但依赖域环境配置（keytab、SPN、浏览器设置），作为二期增强。

---

### Edge Cases

- AD 账号被禁用（userAccountControl & 2）→ 拒绝登录，提示「账号已被禁用」
- AD 账号密码过期 → 根据 AD 返回的错误码，提示「密码已过期，请在 Windows 上修改密码后重试」
- AD 返回的结果超过分页限制（默认 1000） → 使用分页控制逐页拉取
- AD 中有特殊字符的 DN（如含逗号、反斜杠） → 正确转义处理
- 本地 email 被多个 AD 账号匹配时 → 按 sAMAccountName 精确匹配，不模糊绑定
- 同步时 AD 返回的字段为空 → 使用合理默认值，不覆盖已有本地数据

## Requirements

### Functional Requirements

**认证流程**

- **FR-001**: 系统 MUST 在登录页提供「AD 登录」入口，与现有「邮箱密码登录」并列，用户可选择认证方式。
- **FR-002**: 系统 MUST 通过 LDAP/LDAPS 协议连接 AD 服务器，使用用户提供的账号密码执行 bind 操作验证身份。
- **FR-003**: AD 认证配置（服务器地址、端口、Base DN、管理员绑定凭据）MUST 通过环境变量注入，不硬编码。

**用户同步**

- **FR-004**: 首次 AD 登录成功时，系统 MUST 自动查找或创建本地 User 记录。User 模型需增加 ad_guid 字段（AD objectGUID）作为不可变绑定标识。
- **FR-005**: AD 用户属性到本地 User 字段的映射 MUST 可配置（默认：mail→email, displayName→display_name, department→department, title→title）。
- **FR-006**: 自动同步 MUST NOT 覆盖 is_admin 字段（管理员标记由本地管理）。
- **FR-007**: 提供 `POST /api/v1/admin/ad/sync` 接口，接受 `{ base_dn?, filter?, dry_run? }` 参数，触发批量同步。

**安全**

- **FR-008**: AD 连接 MUST 支持 LDAPS（TLS），生产环境 MUST 启用。
- **FR-009**: AD 管理员绑定密码 MUST 以环境变量 `AD_BIND_PASSWORD` 注入，不出现在日志中。
- **FR-010**: AD 连接错误 MUST NOT 暴露 AD 服务器内部结构信息给前端。

**可插拔**

- **FR-011**: AD 认证 MUST 实现现有 `AuthAdapter` 接口（`backend/app/auth/adapters/base.py`），与 `LocalAuthAdapter` 并行，由配置开关控制是否启用。
- **FR-012**: MUST 支持同时启用「本地账号」和「AD 账号」两种认证方式，用户可在登录页选择。

### Key Entities

- **AD Config（AD 连接配置）**: url（ldap://dc.example.com:389）、base_dn（DC=example,DC=com）、bind_dn（管理员 DN）、bind_password、user_search_filter（默认 (sAMAccountName={account})）、attribute_map（AD 属性→本地字段映射）、tls_enabled
- **User AD Binding（用户 AD 绑定）**: 在 users 表新增 ad_guid 字段（VARCHAR(64) UNIQUE），存储 AD 的 objectGUID（16 字节 binary 转 hex），作为用户与 AD 账号的不可变关联标识

## Constitution Check

- [x] **固定技术栈**: 使用 Python/ldap3 库（纯 Python，与 FastAPI/SQLAlchemy 兼容）；前端使用 React/TypeScript/Tailwind CSS。
- [x] **子路径部署**: AD 登录 API 挂载在 `/api/v1/ad-auth/`，服从统一 Base Path `/woicrew`。
- [x] **双轨认证**: AD 登录成功后同时建立 Web Session 和签发 JWT，与现有一致。
- [x] **契约优先**: API 路径、请求/响应结构在实现前先定义 Pydantic schemas。
- [x] **可扩展**: 通过 AuthAdapter 接口扩展，不影响现有 LocalAuthAdapter 登录逻辑。
- [x] **安全**: AD 密码仅用于 bind 验证，不在本地存储；支持 TLS；密码不出现在日志中。

## Success Criteria

- **SC-001**: 在 AD 服务器正常时，登录流程从提交到完成建立会话在 3 秒内完成。
- **SC-002**: 批量同步 2000 个 AD 用户在 60 秒内完成。
- **SC-003**: AD 服务器不可达时，在 5 秒内返回「认证服务暂时不可用」错误，不超时阻塞。
- **SC-004**: 100% 的 AD 认证密码不出现在应用日志中。

## Assumptions

- 公司 Windows AD 服务器已部署，支持 LDAP/LDAPS 协议访问
- AD 中需要有一个服务账号（bind_dn）用于搜索用户条目
- 默认用户搜索字段为 sAMAccountName（Windows 登录名）
- 前端 base path 为 `/woicrew`，后端 API 前缀为 `/woicrew/api/v1`
- **非目标（明确排除）**: 不在本地存储 AD 密码；不实现 ADFS/SAML 联合认证（一期）；不修改 AD 中的数据；不实现 AD 组的权限映射（一期）

## Implementation Plan

### 后端变更

| 文件 | 动作 | 说明 |
|------|------|------|
| `backend/pyproject.toml` | 修改 | 添加 `ldap3>=2.9` 依赖 |
| `backend/app/core/config.py` | 修改 | 添加 AD 配置字段 |
| `backend/app/models/user.py` | 修改 | 添加 `ad_guid` 列 |
| `backend/app/services/ad_client.py` | **新增** | ADClient 封装 ldap3 |
| `backend/app/auth/adapters/ad.py` | **新增** | ADAuthAdapter 实现 AuthAdapter |
| `backend/app/schemas/ad_auth.py` | **新增** | AD 登录/同步的 Pydantic schemas |
| `backend/app/api/routes/ad_auth.py` | **新增** | AD 登录与同步 API |
| `backend/alembic/versions/xxx_add_ad_guid.py` | **新增** | 数据库迁移 |

### 前端变更

| 文件 | 动作 | 说明 |
|------|------|------|
| `frontend/src/pages/LoginPage.tsx` | 修改 | SSO 占位按钮改为 AD 登录入口 |
| `frontend/src/pages/ADLoginPage.tsx` | **新增** | AD 登录页面 |
| `frontend/src/lib/adAuth.ts` | **新增** | AD 登录 API 封装 |

### 核心认证流程

```
1. 用户在登录页选择「AD 登录」
2. 输入 sAMAccountName + 密码
   → POST /api/v1/ad-auth/login { account, password }
3. 后端 ADAuthAdapter.authenticate():
   a. 用 bind_dn + bind_password 连接 AD
   b. 按 filter=(sAMAccountName=account) 搜索用户
   c. 获取用户 DN → 用 DN + password bind 验证身份
   d. 验证成功 → 读取 AD 用户属性
   e. 查/建本地 User:
      - 按 ad_guid 精确匹配 → 更新 display_name 等属性
      - 无匹配 → 按 email 查本地 → 有则绑定 ad_guid
      - 无匹配 → 自动创建 User
   f. 建立 Session + 签发 JWT → 返回给前端
```
