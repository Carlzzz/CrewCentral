# Data Model: 003-skill-hub

**Date**: 2026-04-07

## 1. `skills`（技能主档）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| slug | VARCHAR(64) | 技能唯一标识（业务唯一） |
| name | VARCHAR(128) | 技能名称 |
| category | VARCHAR(32) | 分类（全部、自动化、采集、社交、自定义等） |
| summary | VARCHAR(512) | 简短描述 |
| icon_url | VARCHAR(512) | 图标地址 |
| status | VARCHAR(16) | `active` / `disabled` |
| latest_version_id | UUID | 指向当前推荐版本 |
| created_at / updated_at | TIMESTAMPTZ | 审计字段 |

**规则**:
- `slug` 全局唯一。  
- 仅 `active` 状态技能可参与分发计算。  

## 2. `skill_versions`（技能版本）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| skill_id | UUID | FK -> `skills.id` |
| version | VARCHAR(32) | 语义版本号，如 `1.2.0` |
| description | TEXT | 版本描述 |
| changelog | TEXT | 更新日志 |
| platforms | JSON | 适用平台集合（如 `["windows","macos"]`） |
| package_path | VARCHAR(1024) | 包文件存储路径 |
| package_hash | VARCHAR(128) | 下发给客户端的完整性哈希 |
| package_size | BIGINT | 文件大小 |
| published_at | TIMESTAMPTZ | 发布时间 |
| created_by | VARCHAR(36) | 操作人 |

**规则**:
- `skill_id + version` 唯一。  
- `package_hash` 必填。  

## 3. `skill_assignments`（技能授权绑定）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| skill_id | UUID | FK -> `skills.id` |
| target_type | VARCHAR(16) | `user` / `group` / `device_group` |
| target_id | VARCHAR(64) | 目标主体 ID |
| enabled | BOOLEAN | 是否生效 |
| scope | VARCHAR(16) | `all_devices` / `group_only` |
| platform_filter | VARCHAR(32) | 可空（如仅 windows） |
| config_json | JSON | 自定义配置（实现阶段映射为 JSONB 能力） |
| priority | INTEGER | 冲突优先级（用户级 > 用户组） |
| updated_by | VARCHAR(36) | 操作人 |
| created_at / updated_at | TIMESTAMPTZ | 审计字段 |

**规则**:
- 同一 `skill_id + target_type + target_id` 在同一时间仅一个生效绑定。  
- `config_json` 必须是对象（object），不能是数组或纯标量。  

## 4. `skill_download_tokens`（短效下载凭据）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| token_jti | VARCHAR(64) | 唯一标识 |
| skill_version_id | UUID | FK -> `skill_versions.id` |
| principal_type | VARCHAR(16) | `user` / `device` |
| principal_id | VARCHAR(64) | 请求主体 |
| expires_at | TIMESTAMPTZ | 过期时间 |
| used_at | TIMESTAMPTZ | 首次使用时间（可空） |
| revoked_at | TIMESTAMPTZ | 撤销时间（可空） |

**规则**:
- 过期或撤销 token 不可用于下载。  
- 可选一次性使用策略（`used_at` 不为空即拒绝复用）。  

## 5. `skill_audit_logs`（管理审计）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| actor_user_id | VARCHAR(36) | 管理员 |
| action | VARCHAR(32) | `upload` / `publish` / `assign` / `unassign` / `toggle` |
| skill_id | UUID | 相关技能 |
| skill_version_id | UUID | 可空 |
| detail_json | JSON | 变更详情 |
| created_at | TIMESTAMPTZ | 记录时间 |

## 状态/流程（简化）

1. 上传技能包 -> 解析元数据 -> 创建 `skill_versions` 记录。  
2. 管理员选择是否将新版本设为推荐（更新 `skills.latest_version_id`）。  
3. 授权绑定生效后，客户端请求清单时计算可见技能集合。  
4. 客户端发现新版本时请求短效下载凭据，下载后进行 hash 校验。  
5. 校验通过才加载新版本，否则保留旧版本并记录失败。
