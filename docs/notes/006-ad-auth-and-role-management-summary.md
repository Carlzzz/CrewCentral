# AD 认证集成与角色管理优化 — 实现笔记

> **分支**: `feature/role-management-ad-mapping`
> **日期**: 2026-07-06
> **状态**: 实现完成，自动化验证 + Playwright 端到端测试通过

---

## 一、整体架构

本次工作分三个阶段：

1. **AD 认证集成（006-ad-auth）** — AD 账号密码登录、首次登录自动同步用户、管理员批量同步
2. **角色管理优化** — 硬编码 5 个内置角色升级为数据库角色实体，支持自定义角色，AD 安全组映射到角色
3. **AD 嵌套组 + OU 映射** — 安全组嵌套展开（chain rule）+ AD 组织单元（OU）映射到角色

### 核心设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| AD 组/OU 与角色的关系 | **映射到**角色（不是组/OU 即角色） | 权限由系统角色管理，AD 只决定用户是哪个角色 |
| 多组/OU 冲突 | 统一优先级取最高 | 安全组映射和 OU 映射共享 priority 空间，数字越大越高 |
| 嵌套组 | LDAP_MATCHING_RULE_IN_CHAIN 展开 | AD 原生支持，一次查询拿到全部组（含父组） |
| OU 粒度 | 直接 OU（用户 DN 第一个 OU= 段） | 一个用户只属于一个 OU，适合按部门定基线 |
| 手动 vs AD | 手动锁定优先 | 管理员改过角色的用户打 `role_locked=true`，AD 不覆盖 |
| 自定义角色 | 管理员在界面 CRUD | 新增/删除/改名/配菜单权限 |

---

## 二、AD 认证集成

### 认证流程

```
1. 用户在登录页选择「AD 登录」
2. 输入 sAMAccountName + 密码
   → POST /api/v1/ad-auth/login { account, password }
3. 后端 ADAuthAdapter.authenticate():
   a. 用 bind_dn + bind_password 连接 AD（LDAP）
   b. 按 (sAMAccountName=account) 搜索用户
   c. 获取用户 DN → 用 DN + password bind 验证身份
   d. 验证成功 → 读取 AD 用户属性
   e. 解析直接 OU（从 DN 第一个 OU= 段）
   f. 解析全部组（chain rule，含嵌套父组）
   g. 查/建本地 User（按 ad_guid → username → 邮箱前缀 → 新建）
   h. 按组+OU 映射解析角色（尊重 role_locked）
   i. 建立 Session + 签发 JWT → 返回前端
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `backend/app/services/ad_client.py` | ldap3 封装：bind 认证、用户搜索、嵌套组解析、OU 解析、组/OU 列表、批量同步 |
| `backend/app/auth/adapters/ad.py` | ADAuthAdapter + sync_user_from_ad + _apply_ad_role |
| `backend/app/api/routes/ad_auth.py` | `/ad-auth/login`、`/ad-auth/admin/ad/sync`、`/ad-auth/admin/ad/groups`、`/ad-auth/admin/ad/ous` |
| `frontend/src/pages/ADLoginPage.tsx` | AD 登录页 |
| `frontend/src/lib/adAuth.ts` | AD 登录 API 封装 |

### 用户匹配顺序（sync_user_from_ad）

```
ad_guid → username(sAMAccountName) → 邮箱前缀唯一匹配 → 新建
```

- **ad_guid**：AD 的 objectGUID（不可变），转成规范 hex 存储
- **username**：sAMAccountName
- **邮箱前缀**：AD 没有邮箱时，尝试匹配本地邮箱前缀 == AD 用户名的账号（仅唯一匹配时绑定，避免误绑）
- **新建**：以上都没匹配到，创建新用户

### objectGUID 处理（踩过的坑）

AD 的 objectGUID 有两种返回形式，必须统一为同一个 hex：

- `entry_attributes_as_dict`（登录路径）：格式化字符串 `{c82f1816-...}`
- `raw_attributes`（批量同步路径）：原始 16 字节 bytes（小端序）

**解法**：bytes 用 `uuid.UUID(bytes_le=...)` 解析，字符串去掉 `{}` 和 `-`，两者统一到标准 GUID hex。

### AD 组解析（含嵌套）

- 使用 **LDAP_MATCHING_RULE_IN_CHAIN**（`1.2.840.113556.1.4.1941`）一次查询拿到用户全部组（含嵌套父组）
- 比直接 memberOf 多出间接属于的组（实测 zhaocao：12 → 15 个组）
- 只对**安全组**有效；可通过 `AD_NESTED_GROUPS=0` 关闭回退到直接 memberOf
- chain rule 失败时自动 fallback 到直接 memberOf

### AD OU 解析

- 从用户 DN 提取**直接 OU**（第一个 `OU=` 段）
- 例：`CN=曹策,OU=信息技术部,OU=人力行政中心,...` → `信息技术部`
- 一个用户只属于一个直接 OU，适合按部门定基线角色

### 环境变量（.env）

```env
AD_AUTH_ENABLED=1
AD_URL=ldap://10.1.1.10:389
AD_BASE_DN=OU=Users,OU=ambilight,DC=ambilight,DC=cc
AD_GROUP_BASE_DN=OU=Group,DC=ambilight,DC=cc
AD_BIND_DN=CN=ldap,OU=...,DC=ambilight,DC=cc
AD_BIND_PASSWORD=********
AD_USER_SEARCH_FILTER=(sAMAccountName={account})
AD_TLS_ENABLED=0                    # 生产环境必须设 1（LDAPS 或 StartTLS）
AD_ATTR_EMAIL=mail
AD_ATTR_DISPLAY_NAME=displayName
AD_ATTR_DEPARTMENT=department
AD_ATTR_TITLE=title
AD_CONNECT_TIMEOUT_SECONDS=5
AD_PAGE_SIZE=500
AD_NESTED_GROUPS=1                  # 1=展开嵌套安全组（chain rule）
```

> **注意**：AD 里没有邮箱时，用户名（sAMAccountName）作为登录和映射的主键，email 可为空。

### 安全要点

- AD 密码只用于 bind 验证，**不存储**、**不出现在日志中**
- AD 连接错误**不暴露**服务器内部信息，前端只看到脱敏消息
- 不可达时 5 秒内返回（`AD_CONNECT_TIMEOUT_SECONDS`）
- ldap3 是同步库，通过 `anyio.to_thread.run_sync` 在线程池中运行，不阻塞事件循环

---

## 三、角色管理优化

### 数据模型

#### `roles` 表（新增）

```text
roles
- key: string PK          角色标识，如 super_admin / it_support
- label: string           显示名，如 超级管理员 / IT支持
- is_system: bool         是否系统内置角色（不可删除）
- is_admin: bool          是否管理员角色
- sort_order: int         排序序号
- created_at / updated_at
```

内置角色种子（迁移自动写入）：

| key | label | is_system | is_admin | sort_order |
|-----|-------|-----------|----------|------------|
| super_admin | 超级管理员 | true | true | 10 |
| skill_admin | 技能管理员 | true | true | 20 |
| ops_admin | 运维管理员 | true | true | 30 |
| docs_admin | 文档管理员 | true | true | 40 |
| viewer | 普通用户 | true | false | 100 |

#### `ad_role_mappings` 表（安全组 → 角色）

```text
ad_role_mappings
- ad_group: string PK     AD 组 CN，如 SG-IT
- role_key: string        映射到的角色 key
- priority: int           优先级（与 OU 映射统一比较）
- updated_at
```

#### `ad_ou_mappings` 表（OU → 角色，新增）

```text
ad_ou_mappings
- ou_name: string PK      直接 OU 名，如 信息技术部
- role_key: string        映射到的角色 key
- priority: int           优先级（与安全组映射统一比较）
- updated_at
```

> 安全组映射和 OU 映射**共享同一个 priority 空间**，解析时取两者中优先级最高的。菜单权限和管理员标记属于目标角色，不属于映射。

#### `users` 表新增字段

- `ad_guid`: AD objectGUID 的 hex，不可变绑定标识
- `username`: sAMAccountName（AD 用户名）
- `department` / `title`: 从 AD 同步
- `role_locked`: bool，管理员手动改过角色后置 true

### 角色解析流程（统一解析器）

```python
# 统一解析：安全组 + OU，取最高优先级
resolve_role_from_ad(db, groups, ou)
  → 收集安全组映射中命中的 (priority, role_key)
  → 收集 OU 映射中命中的 (priority, role_key)
  → 按 priority 降序排序
  → 返回优先级最高的 Role 对象
  → 无命中返回 None

# 获取角色菜单权限
menus_for_role(db, role)
  → super_admin: 始终返回全部菜单
  → 其他角色: 查 role_menu_permissions 表（任意角色 key）
  → 无记录: 内置角色回退默认值，自定义角色返回 []
```

### AD 登录/同步时的角色应用

```python
_apply_ad_role(db, user, groups, ou, is_new=False):
    if user.role_locked:
        return                          # 手动锁定，AD 不覆盖
    role = resolve_role_from_ad(db, groups, ou)  # 统一解析组+OU
    if role:
        set_user_role(user, role.key)
        user.is_admin = role.is_admin
    elif is_new:
        set_user_role(user, "viewer")   # 新用户无映射 → 默认 viewer
    # 已有用户无映射 → 保持原角色不变
```

### 删除角色安全规则

```
delete_role(db, key):
  → 系统内置角色（is_system=true）→ 阻止删除
  → 被 user_roles 引用 → 阻止删除（"正在被 N 个用户使用"）
  → 被 ad_role_mappings 引用 → 阻止删除（"已被 N 个 AD 组映射引用"）
  → 被 ad_ou_mappings 引用 → 阻止删除（"已被 N 个 AD OU 映射引用"）
  → 否则删除角色 + 其 role_menu_permissions 行
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `backend/app/models/role.py` | Role 模型 |
| `backend/app/models/ad_role_mapping.py` | 安全组 → role_key 映射 |
| `backend/app/models/ad_ou_mapping.py` | OU → role_key 映射 |
| `backend/app/auth/role_service.py` | 角色 CRUD、菜单解析、删除阻断（含 OU 引用检查） |
| `backend/app/auth/ad_role_service.py` | 安全组映射 CRUD + **统一解析器** resolve_role_from_ad |
| `backend/app/auth/ad_ou_service.py` | OU 映射 CRUD |
| `backend/app/auth/adapters/ad.py` | sync_user_from_ad + _apply_ad_role（传 groups + ou） |
| `backend/app/api/routes/users_admin.py` | 角色 CRUD + 用户管理 + 安全组映射 + OU 映射接口 |
| `backend/app/api/routes/ad_auth.py` | AD 登录 + 批量同步 + 组/OU 列表 |
| `frontend/src/pages/admin/UserManagePage.tsx` | 用户/角色/AD组映射/AD OU映射 四 Tab 管理界面 |

### 迁移

| 迁移 | 内容 |
|------|------|
| `0010_ad_guid` | users 加 ad_guid / department / title |
| `0011_ad_username` | users 加 username，email 改可空 |
| `0012_ad_role` | ad_role_mappings 表 + users.role_locked |
| `0013_roles` | roles 表 + 种子内置角色 + ad_role_mappings 转为 role_key |
| `0014_ad_ou` | ad_ou_mappings 表（OU → 角色映射） |

---

## 四、前端管理界面

### 四 Tab 结构

1. **用户** — 搜索/筛选（角色+来源）/ AD 同步按钮 / 用户列表 / 编辑 / 解锁 / 删除
2. **角色管理** — 角色列表（内置+自定义）/ 新增 / 编辑（label + is_admin + 菜单权限）/ 删除（被引用时阻止）
3. **AD 组映射** — 安全组 → 角色，AD 组下拉 + 角色下拉 + 优先级
4. **AD OU 映射** — OU → 角色，OU 下拉 + 角色下拉 + 优先级

### 下拉数据源

- **AD 组下拉**：`GET /ad-auth/admin/ad/groups` → 从 `AD_GROUP_BASE_DN` 拉取真实组（181 个）
- **OU 下拉**：`GET /ad-auth/admin/ad/ous` → 从 `AD_BASE_DN` 拉取真实 OU（83 个）
- **角色下拉**：`GET /admin/users/roles` → 所有角色（内置+自定义）

### 优先级说明

- 安全组映射和 OU 映射**统一比较优先级**，取最高的
- 新建映射时默认角色为 `viewer`（最小权限原则，避免误提权）
- 优先级字段有悬浮提示（ⓘ 图标）和说明文字
- 范围 0-1000，数字越大优先级越高

---

## 五、API 接口一览

### AD 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/ad-auth/enabled` | 前端判断是否显示 AD 登录入口 |
| POST | `/ad-auth/login` | AD 账号密码登录 |
| POST | `/ad-auth/admin/ad/sync` | 批量同步 AD 用户（管理员） |
| GET | `/ad-auth/admin/ad/groups` | 获取 AD 安全组列表（管理员） |
| GET | `/ad-auth/admin/ad/ous` | 获取 AD OU 列表（管理员） |

### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users` | 用户列表 |
| POST | `/admin/users` | 创建本地用户 |
| PATCH | `/admin/users/{id}` | 编辑用户（改角色会 role_locked=true） |
| PATCH | `/admin/users/{id}/role` | 单独改角色（会 role_locked=true） |
| POST | `/admin/users/{id}/unlock-role` | 解除锁定，恢复 AD 同步 |
| DELETE | `/admin/users/{id}` | 删除用户 |

### 角色管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users/roles` | 角色列表（含菜单权限、引用计数） |
| POST | `/admin/users/roles` | 新建自定义角色 |
| PATCH | `/admin/users/roles/{key}` | 编辑角色 |
| DELETE | `/admin/users/roles/{key}` | 删除角色（被引用时阻止） |

### AD 安全组映射

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users/ad-role-mappings` | 映射列表 |
| POST | `/admin/users/ad-role-mappings` | 新增/更新映射 |
| DELETE | `/admin/users/ad-role-mappings/{ad_group}` | 删除映射 |

### AD OU 映射

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users/ad-ou-mappings` | OU 映射列表 |
| POST | `/admin/users/ad-ou-mappings` | 新增/更新 OU 映射 |
| DELETE | `/admin/users/ad-ou-mappings/{ou_name}` | 删除 OU 映射 |

---

## 六、验证状态

### 自动化验证（全部通过）

- ✅ ruff lint（新文件全部通过）
- ✅ 后端导入（APP OK）
- ✅ 迁移（0014_ad_ou head）
- ✅ 角色 CRUD 集成脚本（含 OU 引用检查）
- ✅ 统一解析器测试（组+OU 优先级竞争）
- ✅ 嵌套组解析测试（chain rule，12→15 组）
- ✅ 真实 AD 组列表（181 个）+ OU 列表（83 个）
- ✅ 前端 build（tsc + vite）

### Playwright 端到端测试（通过）

1. ✅ 登录管理后台
2. ✅ 四个 Tab 正常显示（用户/角色管理/AD 组映射/AD OU 映射）
3. ✅ OU 映射弹窗：OU 下拉 83 个选项、角色下拉 5 个内置角色
4. ✅ 创建 OU 映射：信息技术部 → 运维管理员
5. ✅ 点击 AD 同步 → 480 个用户同步完成
6. ✅ **信息技术部 OU 的 14 个用户（含 zhaocao）全部获得运维管理员角色**
7. ✅ 其他用户全部为普通用户（默认 viewer）

---

## 七、已知限制与后续

- **嵌套组仅限安全组**：通讯组不参与 chain rule 递归
- **OU 仅直接层**：只取用户 DN 第一个 OU= 段，不按完整 OU 路径映射
- **ModelPermissionPage**：已修复为显示自定义角色 label
- **未提交**：所有改动在工作树未提交状态，需授权后 commit
- **Kerberos/NTLM SSO**：spec 标为 P3 二期，未实现
- **AD 密码不同步**：AD 密码只用于 bind 验证，本地不存储；本地用户保留原密码（两套并存）
- **ensure_builtin_roles 性能**：每次 get_role 都会调用，可后续优化为启动时检查一次

---

## 八、关键设计原则备忘

1. **AD 密码永不出现在本地** — 只用于 LDAP bind
2. **super_admin 永远全部菜单、不可删除** — 运行时硬编码，不依赖 DB
3. **手动锁定优先于 AD** — 管理员可以临时覆盖个别人
4. **最小权限默认** — 新 AD 用户无映射时给 viewer，新映射默认选 viewer
5. **删除阻断** — 被引用的角色不能删（用户/组映射/OU 映射），避免用户突然失权
6. **Base path 一致** — 所有 API 在 `/woicrew/api/v1` 下
7. **安全组 + OU 统一优先级** — 两套映射共享 priority 空间，取最高的，管理员完全控制
