# Implementation Plan: Device 管理与监控

**Branch**: `002-device-manage` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/002-device-manage/spec.md`；补充设计：数据密集型管理页 — 顶部 **Stat Cards**（总设备/在线/离线/异常），下方 **搜索过滤 + 响应式表格**；状态列 **在线 Ping 动画 + 呼吸灯**；列含设备名/用户名、IP（展示地理）、MAC、当前技能、最后活跃；操作：远程重启、断开连接、查看日志；点击 IP 弹出硬件详情。

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

在 **auth-login** 提供的 JWT/Session 身份链之上，实现设备 **静默注册/更新**、**高频心跳**（Redis 热写 + PostgreSQL 异步批量落库）、**可信 X-Forwarded-For 解析**、**黑名单/强制下线** 拦截；管理端提供 **数据密集型** 设备总览页：顶部统计卡片、可筛选表格（虚拟滚动或分页二选一在实现阶段定）、在线态 **Ping 动画**、行级管控（与 spec 对齐：**踢下线/封禁**；产品补充的 **远程重启/断开/查看日志** 在合同与任务中落地为受控指令与只读日志片段，**不**实现远程桌面与 APM 级崩溃分析）。IP 地理展示采用 **可离线或限频的 GeoIP** 方案，避免阻塞主路径。

## Technical Context

**Language/Version**: Python 3.11+（后端）；TypeScript 5.x（前端）  
**Primary Dependencies**: FastAPI、SQLAlchemy 2.x Async、Alembic、pydantic-settings、redis（async 客户端）、httpx（可选 GeoIP HTTP）、**PostgreSQL**（设备域主库，见 research）；既有 **auth-login** 模块扩展而非重写  
**Storage**: **Redis**（心跳/在线快照、计数缓存、Geo 查询缓存）；**PostgreSQL**（设备主档、审计、黑名单）；与仓库现有 SQLite 开发库可 **并存**（多数据源）或统一到 PG（部署策略见 `research.md`）  
**Testing**: pytest、pytest-asyncio、httpx；前端 Vitest + Testing Library（表格/可访问性抽检）  
**Target Platform**: 内网/私有化 Linux 容器；管理端现代浏览器  
**Project Type**: Web 服务（扩展现有 `backend/` + `frontend/`）  
**Performance Goals**: 心跳路径 p95 写入 Redis &lt; 10ms（内网）；批量刷盘间隔可配置（如 1–5s 或按条数）；管理列表首屏 500 行级 3s 内可感知（spec SC-003）  
**Constraints**: XFF 仅信任受信代理；心跳 **禁止** 每次同步直写 PG；隐私最小化；宪章 `{BASE_PATH}/api/*` 与 `rc` JSON；管理写操作 admin 鉴权 + 审计  
**Scale/Scope**: 设备量级 1e4+ 预留（表格分页/虚拟化）；地理信息 **展示级** 精度，不采集无关硬件指纹

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

权威来源：`.specify/memory/constitution.md`（CrewCentral 项目宪章）。

- [x] **固定技术栈**：延续 Python 3.11+/FastAPI/SQLAlchemy 2 async + uv、React 18/Vite 6/React Router/Tailwind；新增 Redis/PSQL 为规格强制，不改变前端栈。
- [x] **子路径部署**：管理路由挂载于既有 `BASE_PATH`；`basename`/Cookie/Nginx 与 `001-auth-login` 一致策略，见 `quickstart.md`。
- [x] **双轨认证**：客户端设备 API 使用 Bearer JWT（`deps.get_current_user_id` 扩展）；管理页使用 Session（与现网一致）。
- [x] **契约优先**：`specs/002-device-manage/contracts/` 定义注册/心跳/管理/统计；`data-model.md` 对齐字段。
- [x] **简化可扩展**：首期单 Region Geo + 可插拔 MMDB；指令通道优先 **轮询兜底**，WebSocket 可选二期。
- [x] **命名空间与响应**：`{BASE_PATH}/api/v1/devices/*` 等置于 `/api/*`；客户端 `rc`  envelope；管理统计可 `rc` 或文档化例外。
- [x] **安全与运维**：HTTPS、Secrets、管理写鉴权、设备与管控结构化日志；心跳不落敏感 token 明文。

如需偏离上述 MUST，必须在下方 **Complexity Tracking** 表中记录理由与替代控制。

## Project Structure

### Documentation (this feature)

```text
specs/002-device-manage/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md              # /speckit.tasks
```

### Source Code (repository root)

在既有 `backend/app/`、`frontend/src/` 上增量扩展：

```text
backend/app/
├── core/
│   ├── redis.py              # Redis 连接与 key 命名空间
│   └── forwarded_for.py      # 可信 XFF 解析
├── models/
│   ├── device.py
│   ├── device_audit.py
│   └── blocklist.py
├── services/
│   ├── device_registry.py
│   ├── heartbeat_pipeline.py # Redis → PG 批量
│   └── geo_ip.py             # MMDB 或缓存 API
├── api/routes/
│   ├── devices_client.py     # JWT：注册/心跳
│   └── devices_admin.py      # Session：列表/统计/指令
└── jobs/
    └── flush_presence.py     # 异步刷盘（可 ARQ/Celery 或 FastAPI lifespan+task）

frontend/src/
├── pages/admin/
│   └── DeviceManagePage.tsx  # StatCards + FilterBar + DeviceTable
├── components/devices/
│   ├── StatCards.tsx
│   ├── DeviceTable.tsx
│   ├── StatusPing.tsx        # 在线 Ping + 呼吸灯样式
│   └── HardwareModal.tsx     # IP 点击 → 硬件详情
└── lib/devices-api.ts
```

**Structure Decision**: 延续 **前后端分离**；管理页为 **数据密集型**：表格采用 **分页服务端筛选** 为首期默认；若单页超 200 行再引入行虚拟化（research 决策）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 设备域使用 **PostgreSQL** 而宪章示例写「MySQL 生产建议」 | feature spec **FR-005** 明确要求 PG 批量持久化与行业惯用能力 | 单机 SQLite 无法承载规格中的并发心跳刷盘与多节点部署预期 |
| 管理页增加「远程重启/查看日志」操作 | 产品 UI 输入；限制为 **指令 + 只读最近日志片段**，不构成远程桌面 | 与 spec 非目标（远控/APM）不冲突，需在合同写清边界 |

## Post-Design Constitution Check (Phase 1 complete)

- [x] 契约、`data-model.md`、API 前缀与 `rc` 约定已对齐宪章与 `001-auth-login`。
- [x] 设备 `device_uuid` 幂等与 JWT 用户绑定在数据模型中可追溯。
