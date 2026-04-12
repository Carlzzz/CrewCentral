# Data Model: 001-auth-login

**Date**: 2026-04-07  
**DB**: SQLite（开发）/ MySQL（生产）

## 实体关系（逻辑）

```text
User 1 ── * Session
User 1 ── * RefreshToken
AuthorizationRequest * ── 0..1 User（确认前可空）
Session 1 ── 0..1 AuthorizationRequest（授权完成后关联）
```

## 1. `users`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID / BIGINT | PK | 全局 User ID，对外契约稳定 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 登录标识 |
| password_hash | VARCHAR | NULL | 仅本地登录；SSO-only 用户可为 NULL |
| display_name | VARCHAR | NULL | 展示名 |
| avatar_url | VARCHAR | NULL | 头像 URL |
| is_admin | BOOL | NOT NULL, default false | 管理接口 |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**验证**: `password_hash` 必须为强算法输出；禁止明文列。

## 2. `authorization_requests`

承载 `state` 与客户端/设备展示信息，防重放与错绑。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| state | VARCHAR(128) | UNIQUE, NOT NULL | 高熵，一次性 |
| client_label | VARCHAR(128) | NOT NULL | UI：「客户端名称」 |
| device_label | VARCHAR(128) | NOT NULL | UI：Device_Name |
| redirect_scheme | VARCHAR(64) | NOT NULL | 如 `xiaolongxia`，用于构建 Custom URI |
| user_id | FK → users.id | NULL | 登录成功后写入 |
| status | ENUM | NOT NULL | `pending` / `authorized` / `cancelled` / `expired` |
| expires_at | TIMESTAMPTZ | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**规则**: 授权或取消后 `state` 不可复用；过期任务可定时清理。

## 3. `sessions`（Web Session）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | Session id（可映射 Cookie） |
| user_id | FK | NOT NULL | |
| authorization_request_id | FK | NULL | 若从授权流创建则关联 |
| user_agent | VARCHAR | NULL | 审计 |
| ip_hash | VARCHAR | NULL | 可选，隐私友好 |
| created_at | TIMESTAMPTZ | NOT NULL | |
| last_seen_at | TIMESTAMPTZ | NOT NULL | |
| revoked_at | TIMESTAMPTZ | NULL | 废除时刻 |

## 4. `refresh_tokens`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| user_id | FK | NOT NULL | |
| session_id | FK | NOT NULL | |
| token_hash | VARCHAR | NOT NULL | 仅存储哈希 |
| expires_at | TIMESTAMPTZ | NOT NULL | |
| rotated_from_id | FK → refresh_tokens.id | NULL | 轮换链 |
| revoked_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**规则**: 废除会话时级联标记 `revoked_at` 或使校验失败。

## 5. `admin_audit_logs`（可选，首期可简化）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| actor_user_id | FK | 管理员 |
| action | VARCHAR | e.g. `session.revoke` |
| target_session_id | UUID | |
| created_at | TIMESTAMPTZ | |

## 状态转换：`authorization_requests`

- `pending` → `authorized`：用户点「确认授权」且 JWT 已签发。
- `pending` → `cancelled`：用户点「取消」。
- `pending` → `expired`：超过 `expires_at`。

## 与上游模块

- `device-manage` / `skill-center`：仅依赖稳定 `user_id`（及 JWT claims 中的角色/scope 扩展位）；本模型不嵌入设备业务表。
