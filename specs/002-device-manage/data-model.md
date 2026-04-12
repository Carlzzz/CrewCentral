# Data Model: 002-device-manage

**Date**: 2026-04-07  
**Primary store**: PostgreSQL（设备域）  
**Cache**: Redis（心跳、在线快照、Geo 缓存）

## 1. `devices`（主档，PG）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| device_uuid | VARCHAR(64) | 客户端生成，**全局唯一**，幂等键 |
| owner_user_id | VARCHAR(36) | 来自 JWT `sub`，FK 逻辑引用 users |
| name | VARCHAR(128) | 设备展示名 |
| mac_address | VARCHAR(32) | 规范化存储 |
| last_ip | INET | 最近出口 IP（解析 XFF 后） |
| last_ip_geo | VARCHAR(64) | 展示用「省/市」或缓存字符串 |
| os_version | VARCHAR(64) | |
| client_version | VARCHAR(32) | |
| current_skill_slug | VARCHAR(128) | NULL=无；与 skill-center 对齐时 FK |
| status | ENUM | `online` / `offline` / `blocked` / `error`（实现可用字符串+约束） |
| blocked_reason | VARCHAR(256) | 可空 |
| hardware_snapshot | JSONB | **最小**硬件信息（CPU/内存/盘，可空；点击 IP 弹窗数据源） |
| created_at / updated_at | TIMESTAMPTZ | |

**规则**: `device_uuid` + `owner_user_id` 联合业务唯一（或全局 uuid 唯一，择一在迁移中固定）。

## 2. `device_presence`（PG，可由批量任务 upsert）

| 字段 | 类型 | 说明 |
|------|------|------|
| device_id | UUID | PK/FK → devices |
| last_seen_at | TIMESTAMPTZ | 心跳推导 |
| redis_seq | BIGINT | 可选，防乱序 |

## 3. Redis 键约定

- `presence:{device_id}` — Hash：`last_seen`, `ip`, `ttl`  
- `hb:rate:{device_id}` — 可选令牌桶限流  
- `stats:devices` — 计数缓存（总数/在线/离线）— **须与 PG 周期性对账**  
- `geo:{ip}` — 地理字符串缓存

## 4. `blocklist_entries`（PG）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| device_id | UUID | FK |
| reason_code | VARCHAR(32) | |
| created_by | VARCHAR(36) | 管理员 user id |
| created_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | 可空 |

## 5. `admin_device_actions`（审计，PG）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| actor_user_id | VARCHAR(36) | |
| device_id | UUID | FK |
| action | VARCHAR(32) | `kick` / `block` / `unblock` / `reboot_cmd` |
| payload | JSONB | 可空 |
| created_at | TIMESTAMPTZ | |

## 6. `device_commands`（可选，远程重启）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| device_id | UUID | FK |
| command | VARCHAR(32) | `reboot` |
| status | VARCHAR(16) | `pending` / `acked` / `failed` |
| created_at | TIMESTAMPTZ | |

## 状态迁移（简）

- 心跳在阈值内 → `online`（展示层推导或物化）  
- 超时 → `offline`  
- 黑名单 → `blocked`，拦截心跳与鉴权延续
