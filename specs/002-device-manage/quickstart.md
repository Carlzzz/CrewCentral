# Quickstart: 002-device-manage

**Date**: 2026-04-07

## 依赖服务

- **PostgreSQL 16+**（设备域）  
- **Redis 7+**  
- 既有 **auth-login** 后端与 Session/JWT 配置

**一键本地依赖（可选）**：仓库根目录 `docker-compose.device-deps.yml` 提供仅含 PostgreSQL（映射 `5433:5432`）与 Redis（`6379`）的服务。启动示例：

```bash
docker compose -f docker-compose.device-deps.yml up -d
```

连接串示例（PostgreSQL）：`postgresql+asyncpg://crewcentral:crewcentral@127.0.0.1:5433/crewcentral_devices` → 写入 `DATABASE_URL_DEVICES`。

## 环境变量（增量示例）

在 `backend/.env` 中追加（示例名）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL_DEVICES` | `postgresql+asyncpg://user:pass@localhost:5432/crewcentral_devices` |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `TRUSTED_PROXY_CIDRS` | `10.0.0.0/8,172.16.0.0/12` |
| `GEOIP_MMDB_PATH` | GeoLite2-City.mmdb 路径（可选） |
| `OFFLINE_THRESHOLD_MINUTES` | 判离线阈值，默认如 15 |

## 本地运行（概要）

1. 启动 PostgreSQL、Redis。  
2. 配置 `DATABASE_URL_DEVICES`，对设备域执行 Alembic（迁移脚本在实现阶段生成）。  
3. 启动既有 FastAPI 与前端；访问 `{BASE_PATH}/admin/devices`（路由在实现阶段注册）。  
4. 使用已签发 JWT 调用 `POST .../api/v1/devices/register` 与 `.../heartbeat` 验证 Redis→PG 路径。

## Base Path 四一致

与 `001-auth-login` 相同：`Vite base`、`Router basename`、FastAPI `APIRouter(prefix=BASE_PATH)`、Session Cookie `Path`、Nginx `location` — 见 `specs/001-auth-login/quickstart.md`。

设备管理页路由：`{BASE_PATH}/admin/devices`（与前端 `App.tsx` 中 `Route path="/admin/devices"` 及 `BrowserRouter basename` 一致；API 为 `{BASE_PATH}/api/v1/admin/devices/*`）。

## 联调检查

- 经 Nginx 时核对设备表 `last_ip` 与真实出口一致。  
- 心跳风暴时观察 PG QPS **不**随心跳线性上升（Redis 承接）。
