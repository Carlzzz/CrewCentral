**文档版本**：V1.1  
**文档类型**：详细设计说明书（SDD）  
**适用对象**：产品经理、架构师、后端工程师、前端工程师、测试工程师、运维工程师、安全工程师、第三方实施厂商

---

# 1. 引言
## 1.1 编写目的
本文档用于说明 **woicrew中央控管系统** 的系统架构、模块划分、核心流程、数据结构、接口契约、部署方式、安全机制与扩展约束，作为以下工作的统一依据：

+ 架构设计与技术评审
+ 前后端研发实现
+ 测试设计与验收
+ 运维部署与环境配置
+ 第三方公司复刻同类产品

## 1.2 背景说明
woicrew中央控管系统是企业 AI Agent 体系中的中央控制面与分发面，承担以下职责：

+ 客户端版本管理与下载分发
+ 企业 IAM 认证承接
+ 技能仓库管理
+ 设备与用户绑定台账
+ 模型清单配置下发
+ 后台运营治理

本系统不承担客户端运行时、不承担模型代理网关、不承担供应商 token 转换，也不承担完整调用审计。

## 1.3 术语说明
| 术语 | 说明 |
| --- | --- |
| Skill / 技能包 | 通常为 ZIP，包含 `SKILL.md` 和相关脚本/资源 |
| slug | 技能唯一标识，通常与 ZIP 文件名对应 |
| IAM | 企业统一身份与访问管理系统 |
| Session | Web 侧登录态，依赖 Cookie |
| JWT | 客户端登录后获得的 Bearer Token |
| WoiCrew客户端 | 消费本系统 API 的端侧程序 |
| LLM Proxy | 独立模型网关系统，不属于本系统实现范围 |


---

# 2. 设计范围与边界
## 2.1 本系统设计范围
本文覆盖以下模块的详细设计：

1. 门户首页与下载中心
2. 认证中心
3. 技能仓库
4. 设备管理
5. 模型配置
6. 管理后台
7. 客户端开放 API
8. 存储与部署
9. 安全与权限控制

---

# 3. 总体架构设计
## 3.1 逻辑架构
```latex
[浏览器 SPA / 客户端]
          │
          ▼
 [Nginx / 反向代理层]
          │
          ▼
      [FastAPI 应用]
   ┌────────┼────────┐
   ▼        ▼        ▼
[认证层] [业务层] [管理层]
   │        │        │
   ▼        ▼        ▼
[Session] [SQLAlchemy] [文件存储]
   │        │        │
   └────┬───┴───┬────┘
        ▼       ▼
    [MySQL/SQLite]  [bundles / releases / uploads]
          │
          ▼
      [企业 IAM]
```

## 3.2 分层说明
### 3.2.1 表现层
由前端 SPA 和客户端构成：

+ Web 前台：技能浏览、下载、上传、文档、下载中心
+ Web 后台：安装包、技能审核、设备管理
+ 客户端：登录、设备上报、技能上传、模型列表获取

### 3.2.2 接入层
由 Nginx 或等价反向代理承载：

+ 静态资源分发
+ API 转发
+ HTTPS 终止
+ 上传大小限制控制
+ 二级路径代理适配

### 3.2.3 应用层
由 FastAPI 承载所有服务能力：

+ 认证接口
+ 技能接口
+ 设备接口
+ 模型接口
+ 管理端接口
+ 版本与安装包接口

### 3.2.4 数据层
由数据库和文件系统组成：

+ 结构化数据落 MySQL / SQLite
+ 技能 ZIP 文件落本地目录
+ 安装包文件落本地目录
+ 分片上传临时文件落临时目录

## 3.3 部署前缀设计
系统采用统一基路径，例如：

+ `/woicrew/auth/*`
+ `/woicrew/api/*`

设计要求：

1. 前端 Router `basename` 必须与基路径一致
2. 后端 API 前缀必须与基路径一致
3. Cookie Path 必须与基路径一致
4. Nginx 转发规则必须与基路径一致

## 3.4 路由注册关键约束
存在动态路由与静态路由冲突风险。  
例如技能下载路由 `/skills/download` 必须优先于 `/skills/{slug}` 注册，否则 `download` 会被当成 slug 误解析。

---

# 4. 技术选型设计
## 4.1 后端技术栈
| 分类 | 选型 |
| --- | --- |
| 语言 | Python 3.11+ |
| Web 框架 | FastAPI |
| ORM | SQLAlchemy 2.x |
| 会话 | InMemorySessionMiddleware |
| 认证 | OAuth2 + JWT |
| 依赖管理 | uv |
| 文件处理 | 本地文件系统 + 分片上传 |
| 日志 | Python logging |


## 4.2 前端技术栈
| 分类 | 选型 |
| --- | --- |
| 框架 | React 18 |
| 语言 | TypeScript |
| 构建工具 | Vite 6 |
| 路由 | React Router |
| 样式 | Tailwind CSS |
| 国际化 | 项目内方案，非刚性要求 |
| API 调用 | fetch 封装 |


## 4.3 数据存储技术栈
| 分类 | 选型 |
| --- | --- |
| 关系型数据库 | MySQL / SQLite |
| 文件存储 | 本地目录 |
| 会话存储 | 进程内内存（当前实现） |


---

# 5. 模块设计
# 5.1 认证中心
## 5.1.1 目标
为 Web 管理端和客户端提供统一认证能力，实现：

+ Web 登录态管理
+ 客户端 JWT 签发
+ 当前用户识别
+ 管理员鉴权
+ 登出清理

## 5.1.2 认证模式
### Web 侧
+ 基于企业 IAM 登录
+ 登录成功后将用户信息写入 Session
+ 后续通过 Cookie 维持登录态

### 客户端侧
+ 通过 `/auth/login?client=woiclaw|woicrew`
+ 完成 IAM 登录后签发 JWT
+ 通过 redirect_uri 或自定义 scheme 返回客户端
+ 客户端后续通过 Bearer Token 调用 API

## 5.1.3 认证流程
### Web 登录流程
```latex
访问受保护页面
  → 调用 userinfo 检查登录态
  → 未登录时跳转 IAM
  → IAM 回调 callback
  → 后端换 token、取 profile
  → 创建 Session
  → 重定向回前端 returnUrl
```

### 客户端登录流程
```latex
客户端发起 auth/login?client=woiclaw
  → 跳转 IAM
  → 回调 callback
  → 后端签发 JWT
  → redirect 至客户端 scheme 或允许的 redirect_uri
```

## 5.1.4 会话设计
| 项 | 设计 |
| --- | --- |
| 存储方式 | 进程内内存 |
| Cookie 名称 | 可配置 |
| Cookie Path | 与 `WOICREW_BASE_PATH` 一致 |
| 签名方式 | `itsdangerous` |
| 生命周期 | 由 Session 实现配置决定 |


## 5.1.5 JWT 设计
JWT 至少包含：

+ `sub`
+ `name`
+ `account`
+ `mainAccount`
+ `phone`
+ `iat`
+ `exp`

要求：

+ 算法使用 HS256
+ 密钥使用 `JWT_SECRET`
+ 生产环境不得回退到弱默认值
+ 过期时间必须可配置

## 5.1.6 管理员鉴权设计
管理员来源采用 **人工配置**。实现上可落在配置文件、环境变量、数据库表或管理初始化脚本中，但必须满足以下原则：

1. 管理员名单由人工明确维护
2. 系统运行时可判定当前账号是否属于管理员
3. 管理能力不依赖自动推导
4. 变更管理员名单需可控、可追踪、可发布

推荐默认实现为 `admins` 表或静态配置，两者择一。

## 5.1.7 开发模式开关
当 `SKIP_AUTH=1` 时：

+ `userinfo` 返回本地调试用户
+ Web 端视为已登录
+ 客户端登录直接签发 JWT
+ 管理权限默认放开用于本地开发

生产环境禁止启用。

---

# 5.2 技能仓库
## 5.2.1 目标
实现技能的上传、审批、展示、搜索、下载与删除能力，作为系统的核心分发模块。

## 5.2.2 设计对象
技能包由两部分组成：

1. 数据库存储的技能元数据
2. 文件系统中的 ZIP 包

两者通过 `slug` 建立唯一映射：

+ 表记录：`skills.slug`
+ 文件路径：`bundles/{slug}.zip`

## 5.2.3 技能元数据设计
技能数据字段包括：

+ slug
+ name
+ description
+ metadata
+ version
+ category
+ status
+ publisher
+ uploader_account
+ download_count
+ created_at
+ updated_at

## 5.2.4 状态设计
技能状态机固定为两态：

+ 待审批
+ 已审批

设计规则：

1. 新上传技能默认进入“待审批”
2. 经过管理员处理后进入“已审批”
3. 前台公开列表和搜索仅展示“已审批”
4. 未审批技能不应作为公开可见资源展示
5. 不设计“已驳回”“已下架”“草稿”等扩展状态

## 5.2.5 上传设计
### Web 上传
请求要求：

+ 采用 multipart/form-data
+ 必须携带登录态 Cookie
+ 文件必须为 ZIP

处理流程：

1. 前端解析 ZIP
2. 读取 `SKILL.md`
3. 解析 YAML frontmatter
4. 校验关键字段
5. 发送到后端
6. 后端二次校验
7. 保存 ZIP
8. 执行 upsert
9. 状态置为“待审批”或保持现有审批后的业务规则

### 客户端上传
要求：

+ 通过 Bearer JWT 认证
+ ZIP 中必须有 `SKILL.md`
+ `version` 和 `publisher` 必填

## 5.2.6 上传覆盖策略
技能上传采用 **同名覆盖** 策略。  
判定主键为 `slug`：

1. 若系统中不存在该 `slug`，则新建记录并保存 ZIP
2. 若系统中已存在该 `slug`，则新上传内容覆盖原记录和原 ZIP
3. 不保留历史版本链路
4. 不要求 `uploader_account` 参与覆盖判定
5. 若未来需要版本管理，应在技能仓库上单独引入版本体系，而不是改变当前覆盖规则

## 5.2.7 校验规则
至少校验以下项目：

+ 文件为合法 ZIP
+ ZIP 中存在 `SKILL.md`
+ frontmatter 可解析
+ `slug` 非空
+ `name` 非空
+ `version` 非空
+ `publisher` 非空

## 5.2.8 下载设计
下载处理流程：

1. 校验 slug 是否存在
2. 查询数据库记录
3. 查询 ZIP 文件
4. 下载计数加 1
5. 返回文件流

## 5.2.9 删除设计
删除权限规则固定为：

+ 技能 owner 可删除自己上传的技能
+ 管理员可删除任意技能

设计说明：

1. owner 依据 `uploader_account` 与当前登录用户账号做直接匹配
2. `uploader_account` 比较规则不做额外归一化设计
3. 不引入大小写不敏感、域账号裁剪、mainAccount 替换等扩展逻辑
4. 删除时应同步删除数据库记录与 ZIP 文件
5. 若实现上不能做到绝对原子，至少应保证失败可见、可补偿、可人工修复

## 5.2.10 公开查看规则
+ 列表与搜索只展示“已审批”
+ 详情接口原则上也应只允许查看“已审批”技能
+ 未审批技能仅允许 owner 或管理员在受控场景下查看

## 5.2.11 实现细节（当前代码，Skill Hub）
本节与上文若存在表述差异，**以本节与仓库实现为准**，便于研发对齐。

**路径与路由挂载**

+ 主路径前缀由环境变量 `WOICREW_BASE_PATH` 控制，默认 `/woicrew`，即对外完整路径形如 `/woicrew/api/skills`。
+ 环境变量 `ENABLE_LEGACY_ROUTES`（默认 `1`）为真时，同时挂载**无前缀**的同名路由（如 `/api/skills`），便于兼容旧客户端。
+ FastAPI 中 **`GET /skills/download` 必须在 `GET /skills/{slug}` 之前注册**，否则路径段 `download` 会被当作 `slug` 解析（见 `backend/app/main.py`）。
+ 中间件会将路径中连续斜杠规范化（如 `/woicrew//api/...` → `/woicrew/api/...`）。

**状态字段与审批（与 `skills.status` 一致）**

+ 数据库存储字面量：`评审中`、`已通过`、`已驳回`（见 `backend/app/models/skill.py` 注释）。
+ **Web 上传**（`POST .../upload`）与 **Bearer 上传**（`POST .../skills-upload`）在实现中均将新记录 **`status` 直接置为 `已通过`**；管理员可通过 `PATCH .../api/admin/skills/{slug}/status` 将状态改为 `已通过` 或 `已驳回`。
+ 公开列表与搜索在数据访问层 **仅查询 `status == "已通过"`**（`backend/app/db/skills.py` 中 `get_all_skills`、`search_skills`）。

**列表 `GET /api/skills`**

+ 返回数组，元素字段与前端约定一致：`slug`、`name`、`description`、`downloadCount`、`updatedAt`、`publishedAt`、`publisher`、`uploader_account`、`version`、`category`、`status` 等（见 `skills._skill_to_item`）。
+ 排序：`updated_at` 降序。

**搜索 `GET /api/skills/search?q=`**

+ **必填**查询参数 `q`；若为空或未传，返回 **HTTP 400**（`Missing search query`）。
+ 实现为先取全部 **已通过** 技能，再在应用层对 `name`、`description` 做 **大小写不敏感子串** 匹配（非数据库全文索引）。

**详情 `GET /api/skills/{slug}`**

+ 按 `slug` 查询 **不区分 `status`**：只要存在记录即返回（含 `metadata` JSON 解析）。与 5.2.10「仅展示已审批」的**产品期望**相比，实现上更宽松，若需严格隐藏未通过技能，应在路由层增加状态过滤。

**下载 `GET /api/skills/download?slug=`**

+ 校验数据库存在该 `slug` 且 `bundles/{slug}.zip` 文件存在；成功后 **`download_count` 自增**。
+ 当前实现 **未按 `status` 拦截**下载，与详情接口类似，依赖 slug 不可猜测或配合网关策略。

**Web 上传 `POST /api/upload`**

+ 认证：**Session Cookie**（`require_user`）；`SKIP_AUTH=1` 时使用本地调试用户。
+ 表单：`multipart/form-data`，字段 `file`（ZIP）、`slug`（必填）、`name`、`description`（可选）。
+ 校验：ZIP 魔数 `PK`；从 ZIP 内任意 **以 `skill.md` 结尾** 的路径读取 YAML frontmatter，解析 `version`、`publisher`（均可为空）；**不强制** frontmatter 完整。
+ 落盘：`BUNDLES_DIR/{slug}.zip`；元数据 `upsert_skill`，`category` 按账号小写是否为 `woi` / `woiclaw` 映射为 **慧易** 否则 **个人**。
+ 响应：裸 JSON `{ "ok": true, "slug": "..." }`（非 `rc` 封装）。

**客户端上传 `POST /api/skills-upload`**

+ 认证：**`Authorization: Bearer <JWT>`**（`verify_jwt`）。
+ 表单字段同 Web 上传。
+ **额外校验**：`SKILL.md` frontmatter 中 **`version` 与 `publisher` 均必填**，否则返回统一失败格式（见下）。
+ 响应：**统一格式** `{ "rc": 0, "data": { "slug": "..." }, "message": "返回成功" }`；失败时 `rc: 1` 与 HTTP 状态码（`backend/app/api/response.py`）。

**删除 `DELETE /api/skills/{slug}`**

+ 认证：Session；**管理员**（`admins` 表）或 **`uploader_account` 与当前登录 `account` 完全一致（区分大小写）** 可删；否则 403。
+ 删除表记录后尝试删除 `bundles/{slug}.zip`。

---

# 5.3 设备管理
## 5.3.1 目标
记录设备、用户和客户端版本之间的绑定关系，为排障、授权与后续治理提供数据基础。

## 5.3.2 数据来源
设备上报时由客户端提供：

+ deviceUuid
+ osName
+ osVersion
+ appVersion

用户信息由 Bearer JWT 提供：

+ account
+ user_id
+ user_name
+ phone

## 5.3.3 设计规则
+ `device_uuid` 为唯一键
+ 重复上报视为更新
+ 更新 `updated_at`
+ 首次上报写入 `created_at`

## 5.3.4 device_uuid 边界
`device_uuid` 的生成、分配、持久化和稳定性策略 **不归本系统负责**。  
本系统仅消费客户端上传的 `device_uuid` 并将其视为外部已定义好的设备唯一标识。

因此：

1. 本系统不定义 device_uuid 生成算法
2. 本系统不负责卸载重装后的设备识别策略
3. 本系统不负责硬件指纹计算
4. 客户端必须自行保证上传的 device_uuid 满足业务唯一性要求

## 5.3.5 设备查用户
接口通过 `deviceId` 查询设备绑定关系：

+ 未找到设备：返回 404
+ 存在但 token 过期：返回 401
+ 存在且 token 有效：返回绑定用户信息

## 5.3.6 token 策略
`device_reports.token` 保持为 **JWT token 原文保存**。

设计含义：

1. 设备记录会保存客户端最近一次上报所携带的 JWT
2. `user-by-device` 可以基于该 JWT 的有效性判断返回结果
3. 该策略实现简单，但存在敏感信息存储风险
4. 数据库、备份、日志和导出链路必须防止 token 泄露
5. 若后续安全要求提高，可再升级为摘要或独立设备授权机制

## 5.3.7 实现细节（当前代码）
**上报 `POST /api/device-report`**

+ **Content-Type**：`application/json`；请求体字段：`deviceUuid`、`osName`、`osVersion`、`appVersion`（Pydantic 模型 `DeviceReportBody`）。
+ **认证**：JWT 放在请求头 **`Authorization: Bearer <token>`**（非 body 内 `token` 字段）；缺失或无效时返回 **401** 与统一 JSON `{ "rc": 1, "message": "..." }`。
+ **持久化**：使用原始 SQL 按方言分支 — **MySQL** `ON DUPLICATE KEY UPDATE`，**SQLite** `ON CONFLICT(device_uuid) DO UPDATE SET ...`，实现按 `device_uuid` **幂等 upsert**；写入 `account`、`user_id`、`user_name`、`phone`（来自 `verify_jwt` 解析结果）、**`token` 为去掉 `Bearer ` 前缀后的 JWT 串**、OS 与版本字段及时间戳。
+ **成功响应**：HTTP 200，`{ "rc": 0, "data": null, "message": "返回成功" }`。

**按设备查用户 `GET /api/user-by-device?deviceId=`**

+ **无需** `Authorization`；查询参数 **`deviceId`** 对应表字段 `device_uuid`。
+ 无记录：**404**，`rc` 失败格式，`message` 含未绑定语义。
+ 有记录且 `token` 非空：用 `verify_jwt` 校验；**过期或无效 → 401**，提示重新上报类文案。
+ 有记录且 `token` 为空（历史数据）：**不校验 JWT**，直接返回用户信息。
+ 成功 `data` 字段：`name`、`mainAccount`、`phone`、`userId`（注意与 IAM 字段对齐，大小写为当前 API 约定）。

**管理端分页 `GET /api/admin/device-reports`**

+ 认证：**Session + 管理员**（`require_admin`：会话中用户 `account` 经 `mainAccount` 提取后与 `admins` 表匹配；`SKIP_AUTH=1` 时放行）。
+ 查询参数：`page`（默认 1）、`page_size`（默认 50，**上限 200**）、`account_or_user_name` 或别名 **`account`**（模糊匹配 `account` 或 `user_name`）、`device_uuid`（模糊匹配）。
+ 排序：`updated_at DESC`；响应裸 JSON `{ "items": [...], "total": N }`（**非** `rc` 封装）。列表项 **不包含** `token` 字段。

---

# 5.4 模型配置
## 5.4.1 目标
对客户端下发统一的模型清单，供前端或客户端展示可选模型。

## 5.4.2 配置原则
模型配置规则为 **预置支持的模型名**。  
本系统不负责复杂模型编排，仅负责给出系统支持的模型名称列表。

## 5.4.3 数据字段
最低要求字段可包括：

+ key
+ value
+ image（可选）

其中：

+ `key`：模型内部标识
+ `value`：模型展示名称
+ `image`：展示图标，可选

## 5.4.4 设计边界
本系统只负责模型清单配置与下发，不负责：

+ 模型网关权限校验
+ 供应商 token 转换
+ 模型请求代理
+ 调用审计
+ 按用户、部门、租户动态下发差异模型

## 5.4.5 配置要求
模型 `key` 必须与真实 LLM Proxy 中可识别的模型标识保持一致，否则会出现“界面可选但实际不可调用”的问题。

## 5.4.6 实现细节（当前代码）
**公开列表 `GET /api/models`**

+ **无需认证**；成功时返回统一格式 `{ "rc": 0, "data": [ ... ], "message": "返回成功" }`。
+ `data` 元素：`key`、`value`、`image`；其中 **`image` 为整型**（库中缺省按 0，见 `backend/app/api/models.py`）。
+ 排序：按表主键 **`id` 升序**（`get_all_models`）。
+ 异常时返回 `rc: 1` 与 HTTP 500（消息如「程序错误」）。

**管理端 CRUD（均需 Session + 管理员）**

+ `GET /api/admin/models`：返回数组，项含 `id`、`key`、`value`、`image`、`description`、`createdAt`、`updatedAt`（裸 JSON，非 `rc` 封装）。
+ `POST /api/admin/models`：创建；`key` 冲突 → **409**。
+ `PUT /api/admin/models/{model_id}`：部分字段更新；`key` 与其他行冲突 → **409**。
+ `DELETE /api/admin/models/{model_id}`：成功 **204** 无 body。

**相关辅助接口**

+ `GET /api/get-user`：Bearer JWT，返回当前用户 `name`、`mainAccount`、`phone`，统一 `rc` 格式（与设备/模型同一客户端体系）。

---

# 5.5 发布版本与下载中心
## 5.5.1 目标
维护客户端安装包版本、更新说明与下载地址，支持前台展示和后台管理。

## 5.5.2 版本数据设计
版本记录字段包括：

+ version
+ date
+ ch_title
+ en_title
+ ch_content
+ en_content
+ win_x64_url
+ mac_intel_url
+ mac_arm_url

说明：

+ `ch_content`、`en_content` 可设计为 JSON 数组字符串
+ 支持多个更新项
+ 若业务不需要多语言，可仅使用其中实际启用字段

## 5.5.3 版本规则
发布版本规则为 **按需**。  
即当前版本中心只作为版本记录与安装包分发能力，不强行绑定以下复杂规则：

+ 不强制定义“最新版本”标记
+ 不强制定义“强制升级”
+ 不强制定义“推荐升级”
+ 不强制定义“灰度发布”
+ 是否允许同版本覆盖由实施方按实际场景控制

如后续业务明确需要，再在版本中心上引入更强的发布策略。

## 5.5.4 后台能力
管理员可：

+ 查看版本分页列表
+ 编辑下载 URL
+ 删除版本记录
+ 导入版本信息
+ 上传安装包

## 5.5.5 权限规则
安装包上传与版本管理权限固定为：

+ **管理员可上传**
+ **管理员可维护版本**
+ 非管理员不可访问相关管理写接口

因此以下接口必须统一接入管理员鉴权：

+ 导入版本
+ 初始化安装包上传
+ 分片上传安装包
+ 修改下载 URL
+ 删除版本

## 5.5.6 分片上传设计
适用于大文件安装包上传。

流程：

1. 初始化上传，获取 `upload_id`
2. 客户端按 chunk 顺序上传分片
3. 最后一片触发合并
4. 写入 `releases/{version}/{filename}`
5. 清理 `.uploads/{upload_id}`

---

# 5.6 管理后台
## 5.6.1 页面结构
采用后台布局：

+ 左侧菜单导航
+ 右侧业务内容区域

## 5.6.2 功能模块
1. 安装包管理
2. 安装包导入
3. 技能审批管理
4. 设备记录管理

## 5.6.3 访问控制
后台访问条件：

+ 已登录
+ 当前账号属于管理员人工配置名单

否则应：

+ 拒绝接口访问
+ 页面跳回首页或登录页

---

# 5.7 文档中心
## 5.7.1 边界说明
文档中心边界为 **无特殊约束**。  
系统不对文档中心定义复杂产品边界，不要求独立版本化、独立维护后台或独立审核流。

## 5.7.2 设计建议
本期可采用最简实现：

+ 静态文档页面
+ 仓库随代码发布
+ 作为首页和下载中心的补充信息页

如后续业务明确需要，再扩展为完整文档管理模块。

---

# 6. 数据库详细设计
## 6.1 表设计总览
| 表名 | 说明 |
| --- | --- |
| skills | 技能元数据表 |
| device_reports | 设备上报表 |
| release_version | 发布版本表 |
| models | 模型表 |
| admins | 管理员表（或等价人工配置源） |


## 6.2 skills 表
| 字段 | 类型建议 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK | 主键 |
| slug | varchar | unique | 技能唯一标识 |
| name | varchar | not null | 技能名 |
| description | text | nullable | 描述 |
| metadata | text | nullable | 扩展 JSON |
| download_count | int | default 0 | 下载次数 |
| version | varchar | nullable | 技能版本 |
| category | varchar | nullable | 类别 |
| status | varchar | not null | `待审批` / `已审批` |
| publisher | varchar | nullable | 发布方 |
| uploader_account | varchar | nullable | 上传者 |
| created_at | bigint | not null | 毫秒时间戳 |
| updated_at | bigint | not null | 毫秒时间戳 |


## 6.3 device_reports 表
| 字段 | 类型建议 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK | 主键 |
| device_uuid | varchar | unique | 设备唯一标识 |
| account | varchar | nullable | 用户账号 |
| user_id | varchar | nullable | 用户 ID |
| user_name | varchar | nullable | 用户名 |
| phone | varchar | nullable | 手机号 |
| token | text | nullable | Bearer JWT 原文 |
| os_name | varchar | nullable | 系统名称 |
| os_version | varchar | nullable | 系统版本 |
| app_version | varchar | nullable | 应用版本 |
| created_at | datetime | not null | 创建时间 |
| updated_at | datetime | not null | 更新时间 |


## 6.4 release_version 表
| 字段 | 类型建议 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK | 主键 |
| version | varchar | unique | 版本号 |
| date | varchar/date | nullable | 发布日期 |
| ch_title | varchar | nullable | 中文标题 |
| en_title | varchar | nullable | 英文标题 |
| ch_content | text | nullable | 中文更新项 JSON |
| en_content | text | nullable | 英文更新项 JSON |
| win_x64_url | text | nullable | Windows 下载地址 |
| mac_intel_url | text | nullable | Intel Mac 下载地址 |
| mac_arm_url | text | nullable | ARM Mac 下载地址 |


## 6.5 models 表
| 字段 | 类型建议 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| key | varchar | 模型键 |
| value | varchar | 模型显示值 |
| image | text | 图标地址，可选 |


## 6.6 admins 配置源
管理员来源为人工配置。可采用以下任一种实现：

1. `admins` 数据表
2. 配置文件
3. 环境变量白名单
4. 初始化脚本写入数据库

若采用 `admins` 表，可定义为：

| 字段 | 类型建议 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| account | varchar | 管理员账号 |


---

# 7. 文件存储设计
## 7.1 目录规划
| 路径 | 用途 |
| --- | --- |
| `DATA_DIR/bundles/` | 技能 ZIP |
| `RELEASES_DIR/{version}/` | 安装包文件 |
| `RELEASES_DIR/.uploads/{upload_id}/` | 分片上传临时目录 |


## 7.2 文件命名规则
### 技能包
+ 文件名：`{slug}.zip`

### 安装包
+ 存放在对应版本目录下
+ 文件名以客户端产物命名为准

## 7.3 存储约束
+ 目录不存在时应自动创建
+ 上传完成后要校验最终文件存在
+ 合并成功后需删除临时分片目录
+ 删除技能时需考虑删除文件本体

---

# 8. API 详细设计
## 8.1 设计原则
1. REST 风格优先
2. 路径按功能域组织
3. 支持 JSON 响应与文件流响应
4. 客户端接口使用统一 JSON 格式
5. Web 管理端允许部分裸 JSON 响应
6. 所有管理写接口必须鉴权

## 8.2 响应设计
### 统一成功响应
```json
{
  "rc": 0,
  "data": {},
  "message": "返回成功"
}
```

### 统一失败响应
```json
{
  "rc": 1,
  "message": "失败原因"
}
```

### 其他响应
部分管理接口或 Web 接口可能返回：

+ 裸 JSON
+ FastAPI `HTTPException` 的 `{ "detail": "..." }`

前端必须兼容处理。

## 8.3 接口清单
### 路径前缀与响应格式约定
+ **推荐对外路径**：在下列路径前增加 `WOICREW_BASE_PATH`（默认 `/woicrew`），例如技能列表为 `GET /woicrew/api/skills`。
+ **兼容路径**：`ENABLE_LEGACY_ROUTES=1`（默认）时，仍提供无前缀的 `/api/...`、`/auth/...`。
+ **统一 `rc` 响应**：设备上报、按设备查用户、公开模型列表、客户端技能上传等见各接口实现；**技能列表/搜索/详情、Web 上传、管理端部分接口** 为裸 JSON 或 `HTTPException` 的 `detail`，前端需分支处理（见 8.2、5.2.11）。

### 认证接口
+ `GET /auth/login`
+ `GET /auth/callback`
+ `GET /auth/userinfo`
+ `GET /auth/logout`

### 技能接口
+ `GET /api/skills`
+ `GET /api/skills/search`
+ `GET /api/skills/{slug}`
+ `GET /api/skills/download`
+ `POST /api/upload`
+ `POST /api/skills-upload`
+ `DELETE /api/skills/{slug}`

### 设备接口
+ `POST /api/device-report`
+ `GET /api/user-by-device`
+ `GET /api/get-user`

### 模型接口
+ `GET /api/models`
+ （管理）`GET/POST/PUT/DELETE /api/admin/models`（见 5.4.6）

### 版本接口
+ `GET /api/version.json`
+ `GET /api/versions.json`
+ `GET /api/admin/release-versions`
+ `PATCH /api/admin/release-versions/{id}`
+ `POST /api/admin/import-versions`
+ `POST /api/admin/upload-release-init`
+ `POST /api/admin/upload-release-chunk`

### 管理接口
+ `GET /api/admin/skills`
+ `PATCH /api/admin/skills/{slug}/status`
+ `GET /api/admin/device-reports`

## 8.4 接口安全要求
| 接口类别 | 认证方式 |
| --- | --- |
| 公开查询接口 | 无认证 |
| Web 登录接口 | IAM + Session |
| Web 上传/删除 | Session |
| 客户端业务接口 | Bearer JWT |
| 管理接口 | Session + Admin |


## 8.5 技能审批接口约束
**当前代码**（`PATCH /api/admin/skills/{slug}/status`）允许管理员将状态置为 **`已通过`** 或 **`已驳回`**；上传入口写入的默认状态见 5.2.11。

若产品文档仍采用「待审批 / 已审批」二态表述，可与库内字面量 **`评审中` / `已通过`** 等做映射；**驳回能力**以已实现的管理接口为准。

---

# 9. 关键流程时序设计
## 9.1 登录回调时序
```latex
用户/客户端
  → /auth/login
  → IAM authorize
  → /auth/callback
  → token exchange
  → profile fetch
  → Session or JWT
  → redirect 到前端或客户端
```

## 9.2 技能上传时序
```latex
前端/客户端
  → 读取 ZIP
  → 解析 SKILL.md（Web 可选校验；Bearer 必含 version、publisher）
  → 调用上传接口（Session 或 Bearer）
  → 后端校验 ZIP、写库
  → 以 slug 执行覆盖式 upsert
  → 写 bundles/{slug}.zip
  → 当前实现：status 直接为「已通过」（管理员可后续改为「已驳回」）
  → 返回成功
```

## 9.3 技能删除时序
```latex
用户发起删除
  → 校验登录态
  → 判断是否为 owner 或管理员
  → 删除技能表记录
  → 删除 bundles/{slug}.zip
  → 返回成功或补偿失败提示
```

## 9.4 设备上报时序
```latex
客户端
  → Authorization: Bearer JWT + JSON body（deviceUuid 等）
  → 后端 verify_jwt
  → 提取用户信息
  → 原样接收 device_uuid
  → MySQL / SQLite 分支执行 upsert（ON DUPLICATE KEY / ON CONFLICT）
  → 保存 token 原文（去 Bearer 后的串）
  → 返回 rc 格式成功
```

## 9.5 安装包分片上传时序
```latex
后台页面
  → upload-release-init
  → 获取 upload_id
  → 多次 upload-release-chunk
  → 最后一片触发 merge
  → 写 release 目录
  → 清理临时目录
  → 返回成功
```

---

# 10. 前端详细设计
## 10.1 路由设计
### 普通页面
+ `/`
+ `/download`
+ `/docs`
+ `/plugins`
+ `/plugins/:slug`
+ `/plugins/upload`

### 管理页面
+ `/admin/packages`
+ `/admin/import-versions`
+ `/admin/skills`
+ `/admin/devices`

### 兼容路由
+ `/skills`
+ `/skills/:slug`
+ `/upload`

## 10.2 API 基址设计
+ 默认使用 `/woicrew`
+ 通过 `VITE_API_URL` 可覆盖开发环境目标地址
+ 开发态通过 Vite proxy 转发到后端

## 10.3 认证态处理
以下请求必须带 `credentials: "include"`：

+ `userinfo`
+ Web 上传
+ Web 删除
+ 管理后台请求

## 10.4 Mock 设计
当 `VITE_DEV_MOCK_ADMIN=true` 时：

+ 可以使用本地 mock 数据
+ 可跳过部分真实认证或数据请求
+ 仅限开发环境使用

## 10.5 新增页面规范
新增页面必须同步更新：

1. 路由注册
2. 菜单或入口
3. 国际化文案
4. 鉴权逻辑
5. API 封装

---

# 11. 安全设计
## 11.1 认证安全
+ 所有登录回调地址必须做白名单控制
+ `redirect_uri` 不得开放任意跳转
+ `SESSION_SECRET`、`JWT_SECRET` 必须使用高强度随机值

## 11.2 接口安全
+ 管理接口必须严格鉴权
+ Bearer Token 接口必须校验签名和过期时间
+ Session 接口必须校验会话有效性

## 11.3 上传安全
+ 只允许 ZIP 文件
+ 必须校验 ZIP 合法性
+ 必须校验 `SKILL.md`
+ 后续建议加入：
    - 路径穿越检查
    - 恶意压缩包检查
    - 病毒扫描
    - 内容审查

## 11.4 会话扩展风险
当前 Session 存储在进程内存中，存在以下问题：

+ 多实例部署时会话不共享
+ 多 worker 下可能反复登录
+ 无法天然水平扩展

改进方案：

1. Redis Session
2. 数据库 Session
3. Sticky Session（临时方案）

## 11.5 敏感数据风险
设备表存储 JWT 原文存在安全隐患。  
在采用该策略时，数据库访问、导出、日志打印和备份都必须避免明文暴露 token。

## 11.6 审计边界
审计要求为 **无**。  
本期不单独设计审计模块、不单独设计审计日志表、不强制业务动作留痕。

说明：

1. 普通运行日志仍然建议保留，用于问题排查
2. 如甲方未来提出合规要求，再增补审计方案
3. 当前不以审计能力作为交付验收项

---

# 12. 日志与可观测性设计
## 12.1 日志目标
支持以下场景：

+ 登录问题排查
+ 上传失败排查
+ 分片上传合并失败排查
+ 管理接口操作追踪
+ 设备上报问题定位

## 12.2 建议日志分类
+ 访问日志
+ 认证日志
+ 业务日志
+ 错误日志

## 12.3 日志边界
+ 本期只要求基础运行日志
+ 不要求独立审计日志
+ 不要求对外报表化日志能力

---

# 13. 配置设计
## 13.1 后端环境变量
| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 数据库连接 |
| `DATA_DIR` | bundles 等数据目录 |
| `RELEASES_DIR` | 安装包目录 |
| `WOICREW_BASE_PATH` | 系统基路径 |
| `IAM_CLIENT_ID` | IAM 客户端 ID |
| `IAM_CLIENT_SECRET` | IAM 客户端密钥 |
| `IAM_REDIRECT_URI` | IAM 回调地址 |
| `SESSION_SECRET` | Session 签名密钥 |
| `SESSION_COOKIE_NAME` | Session Cookie 名称 |
| `JWT_SECRET` | JWT 密钥 |
| `SKIP_AUTH` | 开发态跳过认证 |
| `ENABLE_LEGACY_ROUTES` | 是否启用兼容路由 |


## 13.2 前端环境变量
| 变量 | 用途 |
| --- | --- |
| `VITE_API_URL` | API 地址 |
| `VITE_FRONTEND_URL` | 前端地址 |
| `VITE_DEV_MOCK_ADMIN` | 是否启用开发 mock |


## 13.3 管理员配置
管理员由人工配置，因此部署时必须明确以下任一来源：

+ 数据表初始化
+ 配置文件写入
+ 环境变量名单
+ 启动脚本注入

---

# 14. 部署设计
## 14.1 本地开发部署
### 前端
```bash
cd frontend
npm ci
npm run dev
```

### 后端
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## 14.2 生产部署建议
推荐拓扑：

+ Nginx
+ FastAPI 服务
+ MySQL
+ 本地或挂载文件目录
+ HTTPS 证书

## 14.3 Docker 部署建议
建议容器划分：

1. 前端静态资源容器或 Nginx 承载
2. 后端应用容器
3. 数据库容器
4. 文件挂载卷

## 14.4 生产部署检查项
+ 基路径一致
+ Cookie Path 一致
+ IAM 回调地址一致
+ 上传大小限制已配置
+ 数据目录已挂载
+ Secret 已替换
+ `SKIP_AUTH` 已关闭
+ 管理写接口已鉴权
+ 管理员名单已正确人工配置

---

# 15. 测试设计建议
## 15.1 功能测试
### 认证
+ Web 登录成功
+ 未登录访问受保护页面跳转 IAM
+ 客户端成功获取 JWT
+ 登出成功

### 技能
+ 仅展示已审批技能
+ 搜索正常
+ 缺失 `SKILL.md` 上传失败
+ 缺失 `version` 或 `publisher` 上传失败
+ 同 slug 上传触发覆盖
+ 删除权限符合 owner 或管理员规则
+ 未审批技能不在公开列表展示

### 设备
+ JWT 非法时报错
+ 重复上报更新成功
+ `user-by-device` 404 / 401 / 200 符合设计
+ 上报后 token 原文成功写入

### 后台
+ 非管理员访问被拒绝
+ 技能审批生效
+ 设备分页查询正常
+ 版本维护正常
+ 安装包上传仅管理员可用

## 15.2 非功能测试
+ 大文件分片上传
+ 二级路径访问
+ Cookie 路径隔离
+ 并发下载
+ 多浏览器会话
+ 高并发登录和上报

## 15.3 安全测试
+ redirect_uri 绕过测试
+ 管理接口越权测试
+ ZIP 恶意输入测试
+ JWT 篡改测试
+ Session 伪造测试
+ token 明文输出检查

---

# 16. 附录：建议源码映射
| 主题 | 建议对应位置 |
| --- | --- |
| 应用入口与路由挂载 | `backend/app/main.py` |
| Session 实现 | `backend/app/auth/session.py` |
| OAuth / JWT | `backend/app/auth/*` |
| 技能接口 | `backend/app/api/skills.py`、`download.py`、`upload.py` |
| 技能数据访问 | `backend/app/db/skills.py` |
| 版本接口 | `backend/app/api/versions.py`、`api/admin/release_versions.py` |
| 设备接口 | `backend/app/api/device_report.py`、`api/admin/device_reports.py` |
| 模型接口 | `backend/app/api/models.py`、`api/admin/models.py`、`db/models.py` |
| 统一响应 | `backend/app/api/response.py` |
| DB 初始化 | `backend/app/db/session.py` |
| 前端 API 封装 | `frontend/src/api.ts` |
| 前端路由 | `frontend/src/pages/App.tsx` |
| 前后台布局 | `frontend/src/components/Layout.tsx`、`AdminLayout.tsx` |




