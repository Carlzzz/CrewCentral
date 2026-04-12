# Quickstart: 001-auth-login 开发与联调

**Date**: 2026-04-07

## 前提

- Python 3.11+、`uv`、Node 20+（或项目锁定的 LTS）
- 可选：Docker + Docker Compose（与宪章部署一致时再补）

## 环境变量（示例）

在实现阶段于 `backend/.env` / `frontend/.env` 中定义（勿提交密钥）：

| 变量 | 说明 |
|------|------|
| `BASE_PATH` | 如 `/woicrew`，须与 Nginx、前端 `basename`、Cookie Path 一致 |
| `SESSION_SECRET` | 会话加密密钥 |
| `JWT_SECRET` | JWT 签名密钥（与 SESSION 独立） |
| `DATABASE_URL` | 如 `sqlite+aiosqlite:///./dev.db` 或 MySQL DSN |
| `SKIP_AUTH` | 仅开发：`0`/`1`；生产必须为 `0` |
| `VITE_BASE_PATH` | 与 `BASE_PATH` 一致，供 Vite `base` 与路由 |

## 本地运行（目标形态）

```powershell
# 后端
cd backend
copy .env.example .env   # 按需修改密钥
uv sync
uv run alembic upgrade head
uv run python scripts/seed_dev_user.py   # 插入 dev@local / dev（非 SKIP_AUTH 时必需）
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
# 前端
cd frontend
copy .env.example .env   # VITE_BASE_PATH=/woicrew/
npm install
npm run dev
```

浏览器访问：`http://127.0.0.1:5173/woicrew/`。  
Vite 将 `/woicrew` 前缀代理到 `http://127.0.0.1:8000`，使 **Cookie 与前端同源**，便于开发调试 Session。

## Nginx 示例（生产）

参见仓库根目录 `docs/nginx-woicrew-example.conf`：将 `location /woicrew/` 反代到 Uvicorn/Gunicorn 上游。

## Base Path 四一致自检

1. **Vite**：`vite.config.ts` 中 `base` 与 `VITE_BASE_PATH`（默认 `/woicrew/`）。  
2. **React Router**：`frontend/src/main.tsx` 使用 `import.meta.env.BASE_URL` 推导 `basename`（与 Vite `base` 一致）。  
3. **FastAPI**：`backend/app/main.py` 中 `APIRouter(prefix=BASE_PATH)`。  
4. **Session Cookie**：`SessionMiddleware(..., path=BASE_PATH)`。  
5. **Nginx**：`location /woicrew/` 与上游路径一致（见示例配置）。  

## 联调桌面客户端

1. 安装包注册 Custom URI Scheme（如 `xiaolongxia://`）。  
2. 客户端构造登录 URL：`https://host{BASE_PATH}/auth/login?state=...&...`（参数以最终实现合同为准）。  
3. 授权成功后检查深度链接是否携带 `state` 与双令牌；失败则用成功页复制/重试路径。

## 合同位置

- API：`specs/001-auth-login/contracts/openapi.yaml`  
- 授权页 UI：`specs/001-auth-login/contracts/ui-authorization.md`
