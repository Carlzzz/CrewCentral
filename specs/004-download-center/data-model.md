# Data Model: Download 客户端发布中心

## Entity: ClientRelease（发布记录）

| Field | Type | Notes |
|-------|------|--------|
| id | UUID / int PK | |
| version | string | 语义化版本，唯一（已发布范围内） |
| release_notes | text | 摘要或全文；安全渲染 |
| changelog_entries | JSON array (optional) | `{ type: 'new' \| 'fix', text: string }[]` |
| update_policy | enum | `optional` \| `forced` |
| status | enum | `draft` \| `published` \| `archived` |
| published_at | datetime nullable | 首次发布或上线时间 |
| created_at / updated_at | datetime | |

**Rules**: 同一 `version` 不能重复 **published**；`forced` 与 `optional` 在 API 中必须可区分。

## Entity: ClientReleaseAsset（平台资产）

| Field | Type | Notes |
|-------|------|--------|
| id | PK | |
| release_id | FK → ClientRelease | |
| platform | enum | `windows` \| `macos` \| `linux` |
| download_url | string | HTTPS URL，非 DB BLOB |
| file_name | string | 如 `app-1.2.0.exe` |
| file_size_bytes | int optional | |
| md5 | string | 必填（或 sha256 必填 + md5 可选，与实现一致） |
| sha256 | string | 必填 |
| created_at | datetime | |

**Rules**: 某 `release` 在 **enabled 平台** 上必须 **url + sha256（+ md5 按契约）** 齐全；缺失则拒绝发布。

## Entity: ClientReleaseAudit（发布审计）

| Field | Type | Notes |
|-------|------|--------|
| id | PK | |
| release_id | FK | |
| action | enum | `create` \| `update` \| `publish` \| `archive` |
| actor_id / actor_name | string | 来自 Session |
| diff_summary | text optional | 变更摘要 |
| created_at | datetime | |

## View: DownloadRecommendation（组合视图，非独立表）

由最新 **published** Release + Assets + UA 推断：

- `recommended_platform`, `primary_download`, `alternates[]`, `release_notes_excerpt`, `changelog_entries`, `checksums`（按平台）

## View: UpdateCheckResult（API 响应形状）

- `is_latest`: bool  
- `target_version` | null  
- `update_policy` | null  
- `assets_summary` | null  
- `message` 语义与 `contracts/openapi.yaml` 一致  
