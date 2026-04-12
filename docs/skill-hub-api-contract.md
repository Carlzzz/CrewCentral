# Skill Hub API 契约

> 客户端（TestCrew Electron）与中控平台 Skill Hub 的 HTTP 接口约定。
> 客户端通过 `baseUrl`（用户在设置中配置的 Hub 地址）拼接以下路径调用。

---

## 1. 获取技能清单

```
GET {baseUrl}/index.json
```

### 请求

无请求体。支持标准 HTTP 缓存头（`If-None-Match` / `ETag`）。

### 响应 `200 OK`

```jsonc
{
  "version": 2,                    // 清单格式版本号（整数，当前推荐 2）
  "items": [
    {
      "id": "search_for_bugs",     // 技能唯一标识（目录名），必填，1-256 字符
      "name": "Search for Bugs",   // 显示名称，可选，≤512 字符
      "version": "1.5",            // 当前最新版本号（语义化），可选，≤64 字符
      "description": "Hillstone Bugzilla 批量搜索工具...", // 简介，可选，≤4096 字符
      "author": "安桥",            // 作者/维护者，可选，≤256 字符
      "category": "安全",          // 分类标签，可选，≤256 字符
      "downloadUrl": "https://hub.example.com/skills/search_for_bugs/v1.5.zip"
      // 技能包下载地址（ZIP），必填，≤2048 字符
    }
    // ... 更多技能
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `version` | `number` | 否 | 正整数 | 清单格式版本，用于未来兼容性判断 |
| `items` | `HubSkillItem[]` | 是 | - | 可用技能列表 |
| `items[].id` | `string` | **是** | 1-256 字符 | 技能唯一 ID，对应安装后的目录名 |
| `items[].name` | `string` | 否 | ≤512 字符 | 人类可读名称，缺省时客户端显示 `id` |
| `items[].version` | `string` | 否 | ≤64 字符 | 最新版本号（如 `1.5`、`2.1.2`），用于更新比对 |
| `items[].description` | `string` | 否 | ≤4096 字符 | 技能功能简介 |
| `items[].author` | `string` | 否 | ≤256 字符 | 作者/维护者名称 |
| `items[].category` | `string` | 否 | ≤256 字符 | 分类标签（如 `安全`、`开发`、`运维`） |
| `items[].downloadUrl` | `string` | **是** | 1-2048 字符 | ZIP 包下载 URL（完整绝对 URL） |

### 错误响应

| 状态码 | 说明 |
|--------|------|
| `404` | Hub 地址错误或清单不存在 |
| `500` | Hub 服务内部错误 |

---

## 2. 下载技能包

```
GET {downloadUrl}
```

`downloadUrl` 来自清单中的 `items[].downloadUrl`，客户端直接 `fetch` 此 URL。

### 请求

无请求体。

### 响应 `200 OK`

- **Content-Type**: `application/zip` 或 `application/octet-stream`
- **Body**: ZIP 文件二进制流

### ZIP 包结构要求

```
skill-id.zip
├── SKILL.md          # 必须存在（技能入口文件）
├── ...               # 其他技能文件
```

或嵌套一层目录：

```
skill-id.zip
└── skill-id/
    ├── SKILL.md      # 客户端会自动查找包内第一个包含 SKILL.md 的目录
    └── ...
```

### SKILL.md frontmatter 格式

技能包中的 `SKILL.md` 文件头部应包含 YAML frontmatter，客户端会解析以下字段：

```markdown
---
name: "搜索 Bug"
description: "Hillstone Bugzilla 批量搜索工具"
version: "1.5"
author: "安桥"
connectivityTest: "email"
---

# 技能正文（Markdown）
...
```

| 字段 | 说明 |
|------|------|
| `name` | 技能显示名称 |
| `description` | 技能功能描述 |
| `version` | 版本号（与清单中的 `version` 对应，客户端用于版本比对） |
| `author` | 作者 |
| `connectivityTest` | 可选，如值为 `email` 则客户端会提供连通性测试入口 |

---

## 3. 版本更新逻辑

客户端行为：

1. 从 `GET {baseUrl}/index.json` 获取清单
2. 将清单中每个 `item.id` 与本地已安装技能匹配
3. 比较 `item.version`（清单） vs 本地 `SKILL.md` frontmatter 中的 `version`
4. 语义化版本比较（`major.minor.patch`），Hub 版本更高时显示 **"更新"** 按钮
5. 更新操作 = 重新下载 ZIP 包 → 覆盖本地目录

```
状态判定：
┌────────────────────────────────────────────────┐
│ 本地未安装该 skill ID     → 显示 "下载" 按钮   │
│ 本地已安装 且 版本相同    → 显示 "已下载" 标签  │
│ 本地已安装 且 Hub版本更高 → 显示 "更新" 按钮   │
└────────────────────────────────────────────────┘
```

---

## 4. 中控平台需要实现的端点汇总

| 端点 | 方法 | 说明 | 响应格式 |
|------|------|------|----------|
| `{baseUrl}/index.json` | GET | 返回技能清单 | JSON（见上方 schema） |
| `{downloadUrl}` | GET | 下载技能 ZIP 包 | `application/zip` 二进制 |

### 最小实现示例（静态文件服务）

最简单的实现方式是将技能清单和 ZIP 包放在静态文件服务器上：

```
/skills/
├── index.json                    # 技能清单
├── search_for_bugs/
│   └── v1.5.zip                  # 技能包
├── woi-storage/
│   └── v1.1.zip
└── hs-ti/
    └── v2.1.2.zip
```

`index.json` 中的 `downloadUrl` 指向对应 ZIP 文件的完整 URL。

### 动态实现（推荐）

对于中控平台，建议实现以下能力：

1. **技能管理后台**：CRUD 技能元数据和 ZIP 包
2. **版本管理**：每个技能维护多个版本，`index.json` 中的 `version` 和 `downloadUrl` 指向最新稳定版
3. **权限控制**：可选，通过 Bearer Token 或 API Key 鉴权（当前客户端不传 Authorization header，如需鉴权请告知，客户端可适配）
4. **CDN / 缓存**：ZIP 包建议通过 CDN 分发，减少中控压力

---

## 5. TypeScript 类型参考

以下类型定义位于 `src/shared/skills/types.ts`，客户端和 Hub 共享：

```typescript
type HubSkillItem = {
  id: string;          // 技能 ID（必填）
  name?: string;       // 显示名称
  version?: string;    // 版本号
  description?: string;// 描述
  author?: string;     // 作者
  category?: string;   // 分类
  downloadUrl: string; // ZIP 下载地址（必填）
};

type HubManifestShape = {
  version?: number;    // 清单格式版本
  items: HubSkillItem[];
};
```

客户端使用 `zod` 校验清单 JSON，不符合以上 schema 的响应会被拒绝。

---

## 6. CrewCentral（光羿Crew 中控）实现说明

部署时 `baseUrl` 与前端 `BASE_PATH`（如 `/woicrew`）一致，且指向**后端可访问的源**（开发中常见为 `http://127.0.0.1:8000/woicrew` 或经 Vite 代理的同路径）。

| 契约路径 | 实际 HTTP 路径示例 |
|----------|-------------------|
| `GET {baseUrl}/index.json` | `GET /woicrew/index.json` |
| `GET {downloadUrl}` | `GET /woicrew/skills/packages/{slug}/{version}.zip` |

清单中 `downloadUrl` 由服务端根据请求 Host 拼出绝对 URL；`items[].id` 对应技能 `slug`。`SKILL.md` 的 YAML 中 `publisher` 与契约附录中的 `author` 等价，上传校验二者至少填其一。

生产环境若经反向代理，请保证 `X-Forwarded-*` 或应用配置的 `base_path` / 对外域名与上述 URL 一致，避免 `downloadUrl` 指向错误主机。
