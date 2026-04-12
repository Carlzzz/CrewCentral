# Research: 002-device-manage

**Date**: 2026-04-07

## 1. 可信客户端 IP（X-Forwarded-For）

**Decision**: 使用可配置 **`TRUSTED_PROXY_CIDRS`** + **`XFF_TRUST_HOPS`**（或等价）解析；取 **受信链左侧第一个非内网** 或按 **链尾向前第 N 跳**（由部署文档约定）；拒绝不可信来源直连伪造。

**Rationale**: 与 Nginx `real_ip` / `set_real_ip_from` 组合；与应用层解析双保险。

**Alternatives considered**: 仅信最左一项 — 易被链外伪造，拒绝。

## 2. 心跳：Redis → PostgreSQL

**Decision**: 心跳仅 **Redis** `HSET/HINCR`/`EXPIRE` 更新 `presence:{device_id}` 与全局计数；**异步 worker** 按时间窗或条数阈值 `COPY`/批量 `UPSERT` 至 PG `device_presence`/`devices.last_seen_at`。

**Rationale**: 满足 FR-005，保护 PG 连接池。

**Alternatives considered**: 每次心跳直写 PG — 明确违反规格。

## 3. PostgreSQL 与现有 SQLite

**Decision**: **设备域**独立 `DATABASE_URL_DEVICES` 指向 PostgreSQL；开发可用 Docker `postgres:16` 或本地 PG；auth 模块暂可保持 SQLite，**同一请求上下文**通过依赖注入选择引擎（或进程内双 `AsyncEngine`）。

**Rationale**: 不强制一次性全库迁移 auth，降低风险。

**Alternatives considered**: 全栈立刻迁 PG — 范围过大，可二期。

## 4. IP 地理位置

**Decision**: 优先 **MaxMind GeoLite2 City MMDB**（离线，内网可镜像文件），结果 **Redis 缓存**（key：`geo:{ip}` TTL 24h）；禁止将精确经纬度用于非安全用途展示，界面展示 **省/市** 级中文文案。

**Rationale**: 满足「124.x.x.x 广东深圳」类展示，低外部依赖。

**Alternatives considered**: 纯在线 API — 延迟与限流风险高。

## 5. 「异常」设备定义（Stat Card）

**Decision**: **异常数** = 状态为 `error` 或 **离线超过 `OFFLINE_THRESHOLD_MINUTES`** 且未标记维护的设备（可配置）；与 **黑名单**（blocked）分列展示，blocked 可计入「异常」或单独卡片 —— **UI 四卡片**：总数 / 在线 / 离线 / 异常（含封禁可选开关，默认异常含「长时间离线」+「健康检查失败」占位）。

**Rationale**: 与产品「异常数」对齐且可测试。

**Alternatives considered**: 异常=仅黑名单 — 信息量少，扩展差。

## 6. 数据密集型表格

**Decision**: **服务端分页 + 服务端筛选**（cursor/limit 或 page/page_size）；列固定左列「状态」；响应式 **横向滚动** + 断点隐藏次要列；在线状态 **CSS 动画**（`animate-ping` + `opacity` 呼吸）且 `prefers-reduced-motion` 降级为静态色点。

**Rationale**: 可达成 SC-003，无障碍。

## 7. 行操作：远程重启 / 断开 / 日志

**Decision**: **断开连接** 映射为既有 **强制下线（revoke session）** 扩展；**远程重启** 作为 **DeviceCommand** 入队，由客户端 **轮询拉取或下心跳回包** 执行；**查看日志** 返回 **最近 N 条服务端可关联的设备事件**（注册/心跳失败/指令），**非** APM 崩溃栈。

**Rationale**: 与 spec 非目标兼容。

## 8. 已解决 NEEDS CLARIFICATION

技术上下文中 **无** 未决 NEEDS CLARIFICATION。
