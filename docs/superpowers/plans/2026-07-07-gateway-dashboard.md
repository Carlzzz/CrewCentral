# 网关监控大屏 — Plan 2: CrewCentral 后端代理 + 前端大屏 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **本计划是两份计划中的第 2 份，依赖 Plan 1（已 merge 到 CrewProxy main）产出的 `GET /metrics` 端点。** 设计依据：`docs/superpowers/specs/2026-07-07-gateway-monitoring-dashboard-design.md`（§5 后端、§6 前端、§7 schema、§8 错误处理）。

**Goal:** 在 CrewCentral 新建一个实时监控大屏页面，后端代理 CrewProxy `/metrics`，前端用 echarts 渲染 6 个模块（KPI / Provider 卡片 / 池子负载条形图 / 配额详情 / 调用趋势 / token 速率），3 秒轮询。

**Architecture:** CrewCentral 后端加 `gateway_admin.py`（`GET /admin/gateway/metrics`，转发到 CrewProxy `/metrics`，admin session 权限守卫）；前端加 `lib/gateway-api.ts`（数据获取）+ `lib/echarts-theme.ts`（浅色主题）+ `pages/admin/GatewayDashboardPage.tsx`（6 模块大屏）+ 子组件，挂在 `/admin/gateway`（admin 内，带 TopNavBar）和 `/dashboard/gateway`（全屏）两条路由。

**Tech Stack:** 后端 FastAPI + httpx + alembic（SQLite）；前端 React 18 + TS + Vite 6 + Tailwind（默认调色板）+ echarts（新依赖）

## Global Constraints

- **`base_path = "/woicrew"`**：前端 `BASE_URL` = `/woicrew/`，API 前缀 `/woicrew/api/v1`；后端路由经 `main.py` 挂 `/api/v1` + base_path。前端同源请求，Vite dev 代理 `/woicrew/api` → `127.0.0.1:8000`。
- **"gateway" 权限必须三处同步**（漏一处 super_admin 即 403）：
  1. `backend/app/auth/role_service.py` 的 `ALL_MENU_KEYS` 加 `{"key":"gateway","label":"网关监控"}`（否则 `clean_menu_keys` 过滤掉）
  2. 同文件 `ROLE_MENUS["super_admin"]` 和 `ROLE_MENUS["ops_admin"]` 的列表里加 `"gateway"`（super_admin 硬编码，不读库）
  3. alembic 迁移 `UPDATE role_menu_permissions SET menu_keys = menu_keys || ',gateway'` 给 super_admin/ops_admin 现有行
- **后端鉴权**：`gateway_admin.py` 端点用 `Depends(require_session_permission("gateway"))`；调 CrewProxy 时 `Authorization: Bearer {crew_proxy_api_key}`（与 `models_admin.py` 一致），超时 5s。
- **`/metrics` 响应契约**（来自 Plan 1，前端类型须对齐）：`{ts, gatewayOnline, totals{last1m,last5m,last1h}, activeProviders, downProviders, providers[{upstreamId, provider, model, health, stats{last1m,last5m,last1h}, credentials[{id, inCooldown, cooldownUntil|null, cooldownReason|null, inFlight, requestsLast1h, quota: {fiveHour?,weekly?}|null, quotaStatus, quotaError|null}]}]}`。`WindowStats = {count, success, fail, successRate, inputTokens, outputTokens, avgCostMs}`。
- **前端无测试框架**：前端 task 验证靠 `cd frontend && npx tsc -b && npx vite build`（类型检查 + 生产构建）通过；UI 正确性靠端到端手动验证（Task 7）。
- **后端无 pytest fixture**：后端验证用独立 asyncio 脚本范式（`backend/test_*.py` 的 `async def main()` + `asyncio.run`，内存 SQLite）或端到端手动。
- **浅色 dashboard 风格**：跟现有 admin 一致（slate/sky Tailwind 基调，`bg-slate-50` 页面，`rounded-xl border border-slate-200 bg-white shadow-sm` 卡片）；echarts 注册 `crew-light` 主题，色板 `['#0ea5e9','#8b5cf6','#f59e0b','#10b981','#f43f5e','#4f46e5','#f97316']`，轴线 `#e2e8f0`、文字 `#475569`。
- **健康/配色语义**（来自 spec §6.4）：healthy 绿(`#10b981`)、degraded 黄(`#f59e0b`)、down 红(`#f43f5e`)；credential 冷却中=红(quota)/橙(rate_limit/network)；配额 >80% 橙、>95% 红。`health` 由后端 `/metrics` 算好返回，前端只渲染。
- **轮询**：前端 `setInterval` 每 3s 拉一次；请求重叠保护（上次未返回跳过）；`document.visibilitychange` 不可见时暂停。

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `backend/app/auth/role_service.py` | `ALL_MENU_KEYS` + `ROLE_MENUS` 加 gateway | 修改 |
| `backend/alembic/versions/20260707_0015_gateway_menu.py` | UPDATE 现有角色 menu_keys | 新建 |
| `backend/app/api/routes/gateway_admin.py` | `GET /admin/gateway/metrics` 代理 | 新建 |
| `backend/app/main.py` | 注册 gateway_admin router | 修改 |
| `frontend/package.json` | 加 echarts 依赖 | 修改 |
| `frontend/src/lib/echarts-theme.ts` | 注册 crew-light 主题 | 新建 |
| `frontend/src/lib/gateway-api.ts` | `GatewayMetrics` 类型 + `fetchGatewayMetrics()` | 新建 |
| `frontend/src/pages/admin/GatewayDashboardPage.tsx` | 大屏主页（骨架 + KPI + Provider 卡 + 组装子组件） | 新建 |
| `frontend/src/components/gateway/*.tsx` | 6 个子组件 | 新建 |
| `frontend/src/App.tsx` | 两条路由 | 修改 |
| `frontend/src/pages/admin/AdminLayout.tsx` | `ADMIN_PERMS` 加 `"gateway"` | 修改 |
| `frontend/src/components/layout/TopNavBar.tsx` | adminMenu + adminActive + can 过滤断 | 修改 |

---

## Task 1: 后端 "gateway" 权限种子（三处同步）

**Files:**
- Modify: `backend/app/auth/role_service.py`（`ALL_MENU_KEYS` + `ROLE_MENUS`）
- Create: `backend/alembic/versions/20260707_0015_gateway_menu.py`
- Create: `backend/test_gateway_perm.py`（独立验证脚本，匹配项目惯例）

**Interfaces:**
- Produces: `menus_for_role(db, "super_admin")` 与 `menus_for_role(db, "ops_admin")` 返回的列表含 `"gateway"`；`ALL_MENU_KEYS` 含 gateway 条目（UI 下拉可选）。

- [ ] **Step 1: 改 `role_service.py` 的 `ALL_MENU_KEYS`**

在 `backend/app/auth/role_service.py` 的 `ALL_MENU_KEYS` 列表（约 37-49 行）末尾追加一项（保持 `{key, label}` 字典格式）：
```python
    {"key": "gateway", "label": "网关监控"},
```

- [ ] **Step 2: 改 `ROLE_MENUS` 的 super_admin 和 ops_admin**

在 `ROLE_MENUS` 字典（约 17-35 行）里，给 `"super_admin"` 和 `"ops_admin"` 两个键的列表都追加 `"gateway"`。例如 super_admin 列表（原本含全部 11 个 key）末尾加 `"gateway"`；ops_admin 列表也加 `"gateway"`。**不要**给 viewer/skill_admin/docs_admin 加（最小权限）。

- [ ] **Step 3: 写 alembic 迁移**

`backend/alembic/versions/20260707_0015_gateway_menu.py`：
```python
"""seed gateway menu permission for admin roles

Revision ID: 0015_gateway_menu
Revises: 0014_ad_ou
Create Date: 2026-07-07
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "0015_gateway_menu"
down_revision: str | None = "0014_ad_ou"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GATEWAY_ROLES = ("super_admin", "ops_admin")


def upgrade() -> None:
    # Append 'gateway' to existing role_menu_permissions rows (CSV menu_keys).
    for role in GATEWAY_ROLES:
        op.execute(
            sa.text(
                "UPDATE role_menu_permissions "
                "SET menu_keys = menu_keys || ',gateway' "
                "WHERE role = :r AND (menu_keys IS NULL OR menu_keys NOT LIKE '%gateway%')"
            ).bindparams(r=role)
        )
        # For a fresh DB where ensure_builtin_roles hasn't seeded the row yet,
        # insert a minimal row (ensure_builtin_roles will broaden it on next run).
        op.execute(
            sa.text(
                "INSERT OR IGNORE INTO role_menu_permissions(role, menu_keys) "
                "VALUES (:r, 'gateway')"
            ).bindparams(r=role)
        )


def downgrade() -> None:
    for role in GATEWAY_ROLES:
        op.execute(
            sa.text(
                "UPDATE role_menu_permissions "
                "SET menu_keys = TRIM("
                "  REPLACE(',' || menu_keys || ',', ',gateway,', ','), ','"
                ") "
                "WHERE role = :r"
            ).bindparams(r=role)
        )
```

- [ ] **Step 4: 写独立验证脚本**

`backend/test_gateway_perm.py`（匹配项目 `test_*.py` 独立 asyncio 脃例）：
```python
import asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.db.base import Base  # 或 app.models.base，见项目实际 Base 导出
from app.auth.role_service import menus_for_role, ensure_builtin_roles, ALL_MENU_KEYS

async def main() -> None:
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Sess = async_sessionmaker(eng, expire_on_commit=False)
    async with Sess() as db:
        await ensure_builtin_roles(db)
        super_perms = await menus_for_role(db, "super_admin")
        ops_perms = await menus_for_role(db, "ops_admin")
        assert "gateway" in super_perms, f"super_admin missing gateway: {super_perms}"
        assert "gateway" in ops_perms, f"ops_admin missing gateway: {ops_perms}"
        assert any(m["key"] == "gateway" for m in ALL_MENU_KEYS), "ALL_MENU_KEYS missing gateway"
    await eng.dispose()
    print("GATEWAY PERM TEST OK")

if __name__ == "__main__":
    asyncio.run(main())
```
> 实现时先 `grep -n "class Base" backend/app/db` 确认 `Base` 的正确导入路径（项目里可能是 `app.db.base.Base` 或 `app.models.base`），用实际的那个。

- [ ] **Step 5: 运行验证**

```bash
cd backend
# 应用迁移到 dev.db（或临时库）
uv run alembic upgrade head
uv run python test_gateway_perm.py
```
Expected: 打印 `GATEWAY PERM TEST OK`。

- [ ] **Step 6: Commit**

```bash
git add backend/app/auth/role_service.py backend/alembic/versions/20260707_0015_gateway_menu.py backend/test_gateway_perm.py
git commit -m "feat(perm): seed gateway menu permission for super_admin/ops_admin"
```

---

## Task 2: 后端 gateway_admin.py 代理路由

**Files:**
- Create: `backend/app/api/routes/gateway_admin.py`
- Modify: `backend/app/main.py`（import + include_router）
- Create: `backend/test_gateway_proxy.py`（独立脚本，可选：直接测 router 逻辑或手动）

**Interfaces:**
- Produces: `GET {base_path}/api/v1/admin/gateway/metrics` → `RcResponse<CrewProxy /metrics payload>`，admin session 权限守卫。

- [ ] **Step 1: 新建 `gateway_admin.py`（照 `models_admin.py` 范式）**

`backend/app/api/routes/gateway_admin.py`：
```python
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends

from app.api.deps import require_session_permission
from app.core.config import get_settings
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/gateway", tags=["gateway-admin"])


@router.get("/metrics")
async def gateway_metrics(
    _admin: User = Depends(require_session_permission("gateway")),
) -> dict:
    """转发到 CrewProxy GET /metrics，返回网关实时监控数据。"""
    settings = get_settings()
    url = f"{settings.crew_proxy_url.rstrip('/')}/metrics"
    headers = {}
    if settings.crew_proxy_api_key:
        headers["Authorization"] = f"Bearer {settings.crew_proxy_api_key}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                return rc_ok(resp.json())
            return rc_err(f"网关返回状态码 {resp.status_code}")
    except Exception as e:
        return rc_err(f"无法连接网关: {e}")
```

> 注意：CrewProxy `/metrics` 在 `crew_proxy_api_key` 为空且未 bypass 时会 401。若 CrewCentral 的 `crew_proxy_api_key` 配置为空，需在 CrewProxy 侧设 `WOICLAW_AUTH_BYPASS=1` 或配一个有效 key。这是部署配置，不影响本任务代码。

- [ ] **Step 2: 在 `main.py` 注册 router**

`backend/app/main.py`：在 routes import 块（约 13-34 行，`models_admin` 那批 import 旁）加：
```python
from app.api.routes import gateway_admin
```
在 `root.include_router(models_admin.router, prefix="/api/v1")` 那批挂载处（约 92-113 行）加一行：
```python
    root.include_router(gateway_admin.router, prefix="/api/v1")
```

- [ ] **Step 3: 端到端冒烟（手动）**

启动（三个进程，分别终端）：
```bash
# 终端1 — CrewProxy（已 merge 到 main，WOICLAW_AUTH_BYPASS=1 绕过 /metrics 鉴权便于冒烟）
cd /c/Users/zhaocao/Documents/GitHub/CrewProxy
npm run build && WOICLAW_AUTH_BYPASS=1 node dist/index.js

# 终端2 — CrewCentral backend
cd /c/Users/zhaocao/Documents/GitHub/CrewCentral/backend
uv run alembic upgrade head
uv run python scripts/seed_dev_user.py   # 建 dev@local/dev（is_admin）
uv run uvicorn app.main:app --reload --port 8000

# 终端3 — 冒烟测试
# 登录拿 session cookie，再调 gateway metrics
curl -s -c /tmp/c.txt -X POST http://127.0.0.1:8000/woicrew/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"dev@local","password":"dev"}'
curl -s -b /tmp/c.txt http://127.0.0.1:8000/woicrew/api/v1/admin/gateway/metrics | head -c 400
```
Expected: 第二个 curl 返回 `{"rc":0,"message":"返回成功","data":{"ts":...,"providers":[...]}}`。若 `rc:1` 看message（网关连不上/超时→检查 CrewProxy 在跑 + crew_proxy_url）；若 403→权限没生效（回 Task 1 检查三处同步）；若 401→未登录。

- [ ] **Step 4: Commit**

```bash
cd /c/Users/zhaocao/Documents/GitHub/CrewCentral
git add backend/app/api/routes/gateway_admin.py backend/app/main.py
git commit -m "feat(gateway): proxy CrewProxy /metrics at GET /admin/gateway/metrics"
```

---

## Task 3: 前端 echarts 引入 + 浅色主题

**Files:**
- Modify: `frontend/package.json`（加 echarts）
- Create: `frontend/src/lib/echarts-theme.ts`

**Interfaces:**
- Produces: `frontend/src/lib/echarts-theme.ts` 导出 `echarts`（已注册 `crew-light` 主题）；所有图表 `import { echarts } from "../lib/echarts-theme"` 并 `init(el, "crew-light")`。

- [ ] **Step 1: 安装 echarts**

```bash
cd frontend
npm i echarts
```
确认 `package.json` dependencies 出现 `"echarts": "^5.x"`。

- [ ] **Step 2: 写主题模块**

`frontend/src/lib/echarts-theme.ts`：
```ts
import * as echarts from "echarts";

echarts.registerTheme("crew-light", {
  color: ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e", "#4f46e5", "#f97316"],
  backgroundColor: "transparent",
  textStyle: { color: "#475569", fontFamily: "inherit" },
  title: { textStyle: { color: "#0f172a" }, subtextStyle: { color: "#64748b" } },
  legend: { textStyle: { color: "#475569" } },
  tooltip: {
    backgroundColor: "rgba(15,23,42,0.92)",
    borderWidth: 0,
    textStyle: { color: "#f8fafc" },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#e2e8f0" } },
    axisTick: { lineStyle: { color: "#e2e8f0" } },
    axisLabel: { color: "#64748b" },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#e2e8f0" } },
    axisLabel: { color: "#64748b" },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
});

export { echarts };
```

- [ ] **Step 3: 验证构建**

```bash
cd frontend
npx tsc -b && npx vite build
```
Expected: 类型检查 + 构建通过（echarts 自带类型，无需 `@types/echarts`）。

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/echarts-theme.ts
git commit -m "feat(frontend): add echarts + crew-light theme"
```

---

## Task 4: 前端 gateway-api.ts + 类型

**Files:**
- Create: `frontend/src/lib/gateway-api.ts`

**Interfaces:**
- Produces: `fetchGatewayMetrics(): Promise<RcResponse<GatewayMetrics>>`；`GatewayMetrics` 及其子类型（对齐 `/metrics` 契约，见 Global Constraints）。

- [ ] **Step 1: 写 `gateway-api.ts`（类型 inline，匹配 `models-api.ts` 范式）**

`frontend/src/lib/gateway-api.ts`：
```ts
import { getJson, type RcResponse } from "./api";

export type WindowStats = {
  count: number;
  success: number;
  fail: number;
  successRate: number;
  inputTokens: number;
  outputTokens: number;
  avgCostMs: number;
};

export type QuotaTier = {
  usedPct: number;
  usedTokens: number | null;
  limitTokens: number | null;
  resetsAt: string | null;
};

export type CredentialQuota = {
  fiveHour?: QuotaTier;
  weekly?: QuotaTier;
} | null;

export type GatewayCredential = {
  id: string;
  inCooldown: boolean;
  cooldownUntil: number | null;
  cooldownReason: "quota" | "rate_limit" | "network" | null;
  inFlight: number;
  requestsLast1h: number;
  quota: CredentialQuota;
  quotaStatus: "ok" | "expired" | "not_configured" | "error";
  quotaError: string | null;
};

export type ProviderHealth = "healthy" | "degraded" | "down";

export type GatewayProvider = {
  upstreamId: string;
  provider: string;
  model: string;
  health: ProviderHealth;
  stats: { last1m: WindowStats; last5m: WindowStats; last1h: WindowStats };
  credentials: GatewayCredential[];
};

export type GatewayMetrics = {
  ts: number;
  gatewayOnline: boolean;
  totals: { last1m: WindowStats; last5m: WindowStats; last1h: WindowStats };
  activeProviders?: number;
  downProviders?: number;
  providers: GatewayProvider[];
};

export async function fetchGatewayMetrics(): Promise<RcResponse<GatewayMetrics>> {
  return getJson<GatewayMetrics>("/admin/gateway/metrics");
}
```

- [ ] **Step 2: 验证构建**

```bash
cd frontend && npx tsc -b
```
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/gateway-api.ts
git commit -m "feat(frontend): add gateway-api types and fetchGatewayMetrics"
```

---

## Task 5: 前端大屏骨架 + KPI + Provider 卡片 + 路由/导航

**Files:**
- Create: `frontend/src/pages/admin/GatewayDashboardPage.tsx`
- Create: `frontend/src/components/gateway/KpiBar.tsx`
- Create: `frontend/src/components/gateway/ProviderCard.tsx`
- Create: `frontend/src/hooks/useGatewayMetrics.ts`（3s 轮询 + 离线态 + 重叠保护）
- Modify: `frontend/src/App.tsx`（两条路由）
- Modify: `frontend/src/pages/admin/AdminLayout.tsx`（`ADMIN_PERMS` 加 `"gateway"`）
- Modify: `frontend/src/components/layout/TopNavBar.tsx`（菜单 + active + can）

**Interfaces:**
- Consumes: `fetchGatewayMetrics`、`GatewayMetrics`（Task 4）
- Produces: `useGatewayMetrics()` hook（返回 `{ data, error, lastUpdated, online }`）；`GatewayDashboardPage` 默认导出；`/admin/gateway` 与 `/dashboard/gateway` 路由可达。

- [ ] **Step 1: 写轮询 hook `useGatewayMetrics.ts`**

`frontend/src/hooks/useGatewayMetrics.ts`：
```ts
import { useEffect, useRef, useState } from "react";
import { fetchGatewayMetrics, type GatewayMetrics } from "../lib/gateway-api";

export type GatewayMetricsState = {
  data: GatewayMetrics | null;
  error: string | null;
  lastUpdated: number | null;
  loading: boolean;
};

const POLL_MS = 3000;

export function useGatewayMetrics(): GatewayMetricsState {
  const [state, setState] = useState<GatewayMetricsState>({ data: null, error: null, lastUpdated: null, loading: true });
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (inFlight.current) return;          // overlap protection
      inFlight.current = true;
      try {
        const res = await fetchGatewayMetrics();
        if (cancelled) return;
        if (res.rc === 0 && res.data) {
          setState({ data: res.data, error: null, lastUpdated: Date.now(), loading: false });
        } else {
          setState((s) => ({ ...s, error: res.message || "加载失败", loading: false }));
        }
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: "无法连接服务器", loading: false }));
      } finally {
        inFlight.current = false;
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return state;
}
```

- [ ] **Step 2: 写 `KpiBar.tsx`**

Props `{ totals: WindowStats; activeProviders?: number; downProviders?: number; lastUpdated: number | null; error: string | null }`。渲染一行 5-6 个 KPI 块：总请求/min(`totals.last1m.count`)、总成功率(`totals.last5m.successRate`，百分比)、总 token/min(`(last1m.inputTokens+outputTokens)`)、活跃 provider(`activeProviders`)、异常 provider(`downProviders`，>0 标红)。每个 KPI 块用 Tailwind：`rounded-xl border border-slate-200 bg-white shadow-sm p-4`。`error` 非空时顶部一条红色横幅 "网关离线/加载失败"，并显示 `lastUpdated` 时间。

- [ ] **Step 3: 写 `ProviderCard.tsx`**

Props `{ provider: GatewayProvider }`。卡片边框颜色随 `health`：healthy=`border-slate-200`、degraded=`border-amber-300 bg-amber-50/40`、down=`border-rose-300 bg-rose-50/50`。内容：provider 名 + model + 健康灯（圆点：healthy `bg-emerald-500`、degraded `bg-amber-500`、down `bg-rose-500`）；近 5min 成功率（`stats.last5m.successRate`%，<90% 标橙）、调用数（`last5m.count`）、平均耗时（`last5m.avgCostMs`ms）；一个 mini 配额条（取该 provider 第一个 `quotaStatus==='ok'` 且有 `fiveHour` 的 credential，画一条 `usedPct` 进度条，颜色按 >80/>95 阈值）。卡片样式同 KPI 块。`down` 时整张卡左侧加一条 `bg-rose-500` 竖条强化。

- [ ] **Step 4: 写 `GatewayDashboardPage.tsx`（骨架）**

```tsx
import { useGatewayMetrics } from "../../hooks/useGatewayMetrics";
import KpiBar from "../../components/gateway/KpiBar";
import ProviderCard from "../../components/gateway/ProviderCard";
// Task 6 的图表组件先留占位 import，Task 6 再实现；此 task 先注释掉占位
// import PoolLoadChart from "../../components/gateway/PoolLoadChart";
// import QuotaGrid from "../../components/gateway/QuotaGrid";
// import TrendChart from "../../components/gateway/TrendChart";
// import TokenRateChart from "../../components/gateway/TokenRateChart";

export default function GatewayDashboardPage() {
  const { data, error, lastUpdated, loading } = useGatewayMetrics();
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">网关监控</h1>
            <p className="text-sm text-slate-500 mt-1">CrewProxy 实时调用 · 池子负载 · 配额</p>
          </div>
          <span className="text-xs text-slate-400">{data ? `刷新于 ${new Date(lastUpdated ?? Date.now()).toLocaleTimeString()}` : (loading ? "加载中…" : "")}</span>
        </div>
        {data ? (
          <>
            <KpiBar totals={data.totals} activeProviders={data.activeProviders} downProviders={data.downProviders} lastUpdated={lastUpdated} error={error} />
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.providers.map((p) => <ProviderCard key={p.upstreamId} provider={p} />)}
            </section>
            {/* Task 6 在此处插入 PoolLoadChart / QuotaGrid / TrendChart / TokenRateChart */}
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            {error ? `加载失败：${error}` : "加载中…"}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 接路由 `App.tsx`**

`frontend/src/App.tsx`：顶部 import `GatewayDashboardPage`（也复用为全屏页；若想区分可再导出一个薄包装，但本计划复用同一组件）：
```tsx
import GatewayDashboardPage from "./pages/admin/GatewayDashboardPage";
```
在 `<Route path="/admin" element={<AdminLayout />}>` 块内加：
```tsx
<Route path="gateway" element={<GatewayDashboardPage />} />
```
在 admin 块外、与其他顶级路由并列加：
```tsx
<Route path="/dashboard/gateway" element={<GatewayDashboardPage />} />
```

- [ ] **Step 6: 接 AdminLayout 权限**

`frontend/src/pages/admin/AdminLayout.tsx`：把 `"gateway"` 加入 `ADMIN_PERMS` 数组（约第 7 行）。

- [ ] **Step 7: 接 TopNavBar 菜单**

`frontend/src/components/layout/TopNavBar.tsx` 四处编辑：
1. `adminMenu` 数组加 `{ to: "/admin/gateway", label: "网关监控" }`
2. `adminActive` 表达式加 `|| pathname.startsWith("/admin/gateway")`
3. 外层 `if` 条件（约 157 行）加 `|| can("gateway")`
4. filter 里加分支：`if (x.to.endsWith("/gateway")) return can("gateway");`（与现有 `endsWith` 分支同范式）

- [ ] **Step 8: 验证构建**

```bash
cd frontend && npx tsc -b && npx vite build
```
Expected: 通过。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks/useGatewayMetrics.ts frontend/src/components/gateway/KpiBar.tsx frontend/src/components/gateway/ProviderCard.tsx frontend/src/pages/admin/GatewayDashboardPage.tsx frontend/src/App.tsx frontend/src/pages/admin/AdminLayout.tsx frontend/src/components/layout/TopNavBar.tsx
git commit -m "feat(frontend): gateway dashboard skeleton — KPI, provider cards, routing, nav"
```

---

## Task 6: 前端图表模块（echarts）

实现 spec §6.2 的模块 3-6：池子负载条形图、配额详情、调用趋势、token 速率。

**Files:**
- Create: `frontend/src/components/gateway/PoolLoadChart.tsx`
- Create: `frontend/src/components/gateway/QuotaGrid.tsx`
- Create: `frontend/src/components/gateway/TrendChart.tsx`
- Create: `frontend/src/components/gateway/TokenRateChart.tsx`
- Modify: `frontend/src/pages/admin/GatewayDashboardPage.tsx`（接入 4 个图表）
- Modify: `frontend/src/hooks/useGatewayMetrics.ts`（为趋势图维护历史窗口，见下）

**Interfaces:**
- Consumes: `GatewayMetrics`（Task 4）、`echarts`（Task 3）
- Produces: 4 个图表子组件，默认导出，props 见各 Step。

> **实现约定（所有 echarts 组件共性）**：用 `useRef<HTMLDivElement>` + `useEffect` 里 `echarts.init(el, "crew-light")`；窗口 resize 时 `chart.resize()`（监听 `window.resize`，卸载时 `chart.dispose()`）。从 `"../../lib/echarts-theme"` import `echarts`（带主题注册）。空数据时渲染占位"暂无数据"。

- [ ] **Step 1: `PoolLoadChart.tsx` — 池子负载条形图（横向）**

Props `{ providers: GatewayProvider[] }`。横向条形图（echarts `yAxis.type:'category'` + `xAxis.type:'value'`）。每个 credential 一条，y 轴标签 = `provider/credentialId`（按 provider 分组排序）。值 = `requestsLast1h`。**条目颜色**：`inCooldown` 时用红（`cooldownReason==='quota'` → `#f43f5e`，否则 `#f97316`）；正常用 provider 主色（按 provider index 取主题色板）。tooltip 显示 `requestsLast1h` + 冷却状态/原因/剩余时间（`cooldownUntil` 倒计时）。标题"池子负载（近 1h 调用次数）"。

- [ ] **Step 2: `QuotaGrid.tsx` — 配额详情**

Props `{ providers: GatewayProvider[] }`。从所有 provider 的 credentials 里筛出 `quotaStatus==='ok'` 且有 `fiveHour` 的，每个 credential 一张小卡：标题 `provider/credentialId`；一个进度环（echarts gauge，`usedPct`）或简单 div 进度条（颜色：`usedPct>95` 红、`>80` 橙、否则蓝）；下方文字"已用 X / Y（Z%）"+ 重置倒计时（`fiveHour.resetsAt` 变成"还剩 Hh Mm"）；若有 `weekly`，次行小字"周：W%"。`quotaStatus!=='ok'` 的 credential：`expired`→"key 失效"、`error`→"查询失败（{quotaError}）"、`not_configured`→不展示。标题"配额（5h / 周）"。

- [ ] **Step 3: `TrendChart.tsx` — 调用趋势折线（近 1h）**

echarts 折线/柱组合。**数据来源**：`/metrics` 只返回当前窗口聚合（无历史序列）。为展示趋势，hook 维护一个**前端滚动历史**（见 Step 5）：每次轮询把当前 `totals.last1h`（或各 provider 的 last5m successRate）push 到一个 ring buffer（保留 120 个采样 = 6 分钟，3s/次）。`TrendChart` 画双轴：柱=总调用（取 buffer 里每个采样的某窗口 count 增量近似），折线=成功率（`successRate*100`）。提供 provider 下拉切换"全部/某 provider"（切换时 hook 需按 provider 维度存历史——简化：第一版只画 totals 趋势，provider 切换作为 props 可选，若实现复杂先只做 totals）。

> 实现提示：第一版可只做 **totals 的成功率折线 + 调用数柱**（不按 provider 切分），避免 hook 复杂度。spec §6.2 模块5 的"按 provider 切换"作为可选增强。

- [ ] **Step 4: `TokenRateChart.tsx` — token 速率**

Props `{ history: HistorySample[] }`（Step 5 的 ring buffer）。echarts 堆叠面积图：x=时间，y=tokens/min；两条堆叠 `inputTokens`/`outputTokens`（用 buffer 采样的 last1m token 换算成 /min 近似，或直接画 last1m 的 input+output）。颜色用主题色板前两色。

- [ ] **Step 5: 扩 `useGatewayMetrics.ts` 维护历史 ring buffer**

在 hook 内额外维护 `historyRef = useRef<HistorySample[]>([])`，每次成功 fetch push 一个采样 `{ ts, count: totals.last1h.count, successRate: totals.last5m.successRate, inputTokens: totals.last1m.inputTokens, outputTokens: totals.last1m.outputTokens }`，裁剪到最近 120 个。导出 `history` 状态（额外触发渲染）。`export type HistorySample = {...}`。

- [ ] **Step 6: 接入 `GatewayDashboardPage.tsx`**

取消 Task 5 Step 4 的注释占位，import 4 个组件并在 Provider 卡片行下方按顺序渲染：
```tsx
<PoolLoadChart providers={data.providers} />
<QuotaGrid providers={data.providers} />
<TrendChart history={history} />
<TokenRateChart history={history} />
```
每个用 `<section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">` 包裹，带小标题。

- [ ] **Step 7: 验证构建**

```bash
cd frontend && npx tsc -b && npx vite build
```
Expected: 通过。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/gateway/ frontend/src/hooks/useGatewayMetrics.ts frontend/src/pages/admin/GatewayDashboardPage.tsx
git commit -m "feat(frontend): gateway dashboard charts — pool load, quota, trend, token rate"
```

---

## Task 7: 端到端验证

**Files:** 无（验证 + 可能微调 README）

- [ ] **Step 1: 三进程启动**

```bash
# CrewProxy（Plan 1 已在 main，需配 crew_proxy_api_key 或 bypass）
cd /c/Users/zhaocao/Documents/GitHub/CrewProxy
npm run build && WOICLAW_AUTH_BYPASS=1 node dist/index.js

# CrewCentral backend
cd /c/Users/zhaocao/Documents/GitHub/CrewCentral/backend
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# CrewCentral frontend
cd /c/Users/zhaocao/Documents/GitHub/CrewCentral/frontend
npm run dev
```

- [ ] **Step 2: 浏览器验证**

打开 `http://127.0.0.1:5173/woicrew/`，以 `dev@local`/`dev` 登录。验证：
1. 顶部导航出现"网关监控"菜单项（super_admin 可见）。
2. 点击进入 `/admin/gateway`，页面加载，KPI 条、Provider 卡片出现。
3. 数据每 3s 刷新（观察刷新时间变化）。
4. 池子负载条形图：minimax 的 4 个 key 有调用次数条；冷却中的 key（若有）变红/橙。
5. 配额详情：minimax key 显示 5h 进度 + 重置倒计时；glm 显示"查询失败（当前用户不存在coding plan）"或换 coding plan key 后显示进度。
6. 调用趋势 + token 速率：随着请求累积，曲线开始有数据（可对 minimax 发几个 `/v1/messages` 请求观察）。
7. 切到 `/dashboard/gateway` 全屏页，无 TopNavBar，内容一致。
8. 停掉 CrewProxy，前端顶部出现"网关离线"横幅，保留最后一次数据。

- [ ] **Step 3: README（可选）**

在 `CrewCentral` 适当 README 加一节说明网关监控页 + 所需的 `gateway` 权限 + CrewProxy `/metrics` 依赖。

- [ ] **Step 4: Commit（如有改动）**

```bash
git add -A
git commit -m "docs: gateway monitoring dashboard verification"
```

---

## 完成判据（Plan 2 Done Definition）

- `cd backend && uv run python test_gateway_perm.py` 打印 OK；`uv run alembic upgrade head` 无错。
- `cd frontend && npx tsc -b && npx vite build` 通过。
- `GET /api/v1/admin/gateway/metrics`（登录后）返回 `rc:0` + CrewProxy `/metrics` payload。
- 浏览器 `/admin/gateway` 与 `/dashboard/gateway` 渲染 6 模块，3s 刷新，冷却/配额颜色正确，离线横幅生效。
- 所有改动按 task 分多次 commit。

完成后整个"网关监控大屏"功能可用：CrewProxy 采集 + CrewCentral 可视化。
