# Quickstart: Download 客户端发布中心

## 前置

- 仓库 `backend/`、`frontend/` 与既有 auth 一致。  
- 若本地 Alembic 版本落后于 `0002_skill_hub` 且 SQLite 已手工存在技能表，可在确认表结构后执行 `alembic stamp 0002_skill_hub` 再 `alembic upgrade head`（仅开发环境应急）。  
- 配置 `BASE_PATH`（如 `/woicrew`），并保证四一致：  
  - 前端 Router `basename`  
  - FastAPI 路由前缀  
  - Session Cookie `Path`  
  - Nginx 反向代理  

## 本地联调

1. 启动后端（含迁移）：创建 `client_release` / `client_release_asset` / `client_release_audit` 表（以 Alembic 为准）。  
2. 以管理员登录后台，创建一条 **published** 发布，填写三平台 URL、**md5/sha256**、changelog 条目（new/fix）。  
3. 访问 `{BASE_PATH}/download`，用不同 UA 或浏览器验证主按钮高亮。  
4. 调用 `GET {BASE_PATH}/api/v1/releases/latest?current_version=0.0.1`，核对 `rc`、`is_latest`、`update_policy`。  
5. 核对 `GET .../public/releases/download-context` 与页面数据一致。

## 契约文件

- `contracts/openapi.yaml` — API 形状  
- `contracts/ui-download-landing.md` — 落地页 UI 与进度条边界  

## 测试建议

- 契约测试：`/releases/latest` 在 forced/optional/已最新 三种情况下的 JSON。  
- 落地页：Playwright 或手工三种 UA。  
