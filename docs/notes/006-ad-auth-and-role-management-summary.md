# AD 认证集成与角色管理优化 — 实现笔记

> **分支**: `feature/role-management-ad-mapping`
> **日期**: 2026-07-06
> **状态**: 实现完成，自动化验证通过，待手动浏览器冒烟测试 + 提交

---

## 一、整体架构

本次工作分两个大阶段：

1. **AD 认证集成（006-ad-auth）** — 实现 AD 账号密码登录、首次登录自动同步用户、管理员批量同步 AD 用户
2. **角色管理优化** — 把硬编码的 5 个内置角色升级为数据库角色实体，支持自定义角色，AD 组映射到角色（而非直接当角色）

### 核心设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| AD 组与角色的关系 | AD 组**映射到**角色（不是 AD 组即角色） | 权限仍由系统角色管理，AD 组只决定用户是哪个角色 |
| 多组冲突 | 按优先级取最高 | 每条映射带 priority 数字，数字越大优先级越高 |
| 手动 vs AD | 手动锁定优先 | 管理员改过角色的用户打 `role_locked=true`，AD 同步不覆盖 |
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
   d. 验证成功 → 读取 AD 用户属性（含 memberOf 组列表）
   e. 查/建本地 User（按 ad_guid → username → 邮箱前缀 → 新建）
   f. 按组映射解析角色（尊重 role_locked）
   g. 建立 Session + 签发 JWT → 返回前端
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `backend/app/services/ad_client.py` | ldap3 封装：bind 认证、用户搜索、组列表、批量同步 |
| `backend/app/auth/adapters/ad.py` | ADAuthAdapter + sync_user_from_ad（用户查/建/更新 + 角色应用） |
| `backend/app/api/routes/ad_auth.py` | `/ad-auth/login`、`/ad-auth/admin/ad/sync`、`/ad-auth/admin/ad/groups` |
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

### AD 组解析

- 从 `memberOf` 属性提取各组的 CN（如 `CN=SG-IT,OU=...` → `SG-IT`）
- **不做嵌套组展开**（一期非目标），只用 AD 直接返回的 memberOf

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
```

> **注意**：AD 里没有邮箱时，用户名（sAMAccountName）作为登录和映射的主键，email 可为空。

### 安全要点

- AD 密码只用于 bind 验证，**不存储**、**不出现在日志中**
- AD 连接错误**不暴露**服务器内部信息，前端只看到脱敏消息（如「认证服务暂时不可用」）
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

#### `ad_role_mappings` 表（改造）

```text
ad_role_mappings
- ad_group: string PK     AD 组 CN，如 SG-IT
- role_key: string        映射到的角色 key（关联 roles.key）
- priority: int           优先级（数字越大越高）
- updated_at
```

> 旧版把 AD 组本身当角色（带 menu_keys/is_admin），现已改为映射到角色。菜单权限和管理员标记属于目标角色，不属于映射。

#### `users` 表新增字段

- `ad_guid`: AD objectGUID 的 hex，不可变绑定标识
- `username`: sAMAccountName（AD 用户名）
- `department` / `title`: 从 AD 同步
- `role_locked`: bool，管理员手动改过角色后置 true

#### `user_roles` 表（不变）

存储 `user_id → role`，role 值指向 `roles.key`。

### 角色解析流程

```python
# 获取用户角色
get_user_role(db, user_id, is_admin)
  → 查 user_roles.role
  → 验证 roles 表中存在
  → 不存在则回退 super_admin(如果is_admin) 或 viewer

# 获取角色菜单权限
menus_for_role(db, role)
  → super_admin: 始终返回全部菜单
  → 其他角色: 查 role_menu_permissions 表
  → 无记录: 内置角色回退默认值，自定义角色返回 []

# AD 组解析角色
resolve_role_from_groups(db, groups)
  → 按 priority 降序遍历 ad_role_mappings
  → 第一个 ad_group 在用户组列表中的映射胜出
  → 返回对应的 Role 对象
```

### AD 登录/同步时的角色应用

```python
_apply_ad_role(db, user, groups, is_new=False):
    if user.role_locked:
        return                          # 手动锁定，AD 不覆盖
    role = resolve_role_from_groups(db, groups)
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
  → 被 user_roles 引用 → 阻止删除（提示"正在被 N 个用户使用"）
  → 被 ad_role_mappings 引用 → 阻止删除（提示"已被 N 个 AD 组映射引用"）
  → 否则删除角色 + 其 role_menu_permissions 行
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `backend/app/models/role.py` | Role 模型 |
| `backend/app/models/ad_role_mapping.py` | ADRoleMapping 模型（ad_group → role_key） |
| `backend/app/auth/role_service.py` | 角色 CRUD、菜单解析、删除阻断 |
| `backend/app/auth/ad_role_service.py` | AD 组映射 CRUD、resolve_role_from_groups |
| `backend/app/auth/adapters/ad.py` | sync_user_from_ad + _apply_ad_role |
| `backend/app/api/routes/users_admin.py` | 角色 CRUD 接口 + 用户管理 + AD 映射接口 |
| `backend/app/api/routes/ad_auth.py` | AD 登录 + 批量同步 + AD 组列表 |
| `frontend/src/pages/admin/UserManagePage.tsx` | 用户/角色/AD映射三 Tab 管理界面 |

### 迁移

| 迁移 | 内容 |
|------|------|
| `0010_ad_guid` | users 加 ad_guid / department / title |
| `0011_ad_username` | users 加 username，email 改可空 |
| `0012_ad_role` | ad_role_mappings 表 + users.role_locked |
| `0013_roles` | roles 表 + 种子内置角色 + ad_role_mappings 转为 role_key |

---

## 四、前端管理界面

### 三 Tab 结构

1. **用户** — 搜索/筛选（角色+来源）/ AD 同步按钮 / 用户列表 / 编辑 / 解锁 / 删除
2. **角色管理** — 角色列表（内置+自定义）/ 新增 / 编辑（label + is_admin + 菜单权限）/ 删除（被引用时阻止）
3. **AD 组映射** — 映射列表 / 新增（AD 组下拉 + 角色下拉 + 优先级）/ 编辑 / 删除

### AD 组下拉

- 数据源：`GET /ad-auth/admin/ad/groups` → 从 AD 服务器 `AD_GROUP_BASE_DN` 拉取真实组列表
- 不再需要手动输入组名

### 角色下拉

- 数据源：`GET /admin/users/roles` → 所有角色（内置+自定义）
- 用户编辑、AD 映射 都从这里选角色

### 优先级说明

- 新建 AD 映射时默认角色为 `viewer`（最小权限原则，避免误提权）
- 优先级字段有悬浮提示和说明文字

---

## 五、API 接口一览

### AD 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/ad-auth/enabled` | 前端判断是否显示 AD 登录入口 |
| POST | `/ad-auth/login` | AD 账号密码登录 |
| POST | `/ad-auth/admin/ad/sync` | 批量同步 AD 用户（管理员） |
| GET | `/ad-auth/admin/ad/groups` | 获取 AD 组列表（管理员） |

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

### AD 组映射

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users/ad-role-mappings` | 映射列表 |
| POST | `/admin/users/ad-role-mappings` | 新增/更新映射 |
| DELETE | `/admin/users/ad-role-mappings/{ad_group}` | 删除映射 |

---

## 六、验证状态

### 自动化验证（全部通过）

- ✅ ruff lint（新文件全部通过）
- ✅ 后端导入（APP OK）
- ✅ 迁移（0013_roles head）
- ✅ 角色 CRUD 集成脚本
- ✅ 真实 AD 组列表（181 个组）
- ✅ AD 映射解析脚本
- ✅ 前端 build（tsc + vite）

### 待手动验证（浏览器冒烟测试）

1. 登录管理后台，角色管理 Tab 显示 5 个内置角色
2. 新建自定义角色（如 IT支持），勾选菜单权限
3. AD 组映射 Tab：AD 组下拉有数据，角色下拉有自定义角色
4. 映射 SG-IT → IT支持，优先级 100
5. 点「AD 同步」，属于 SG-IT 的用户角色变为 IT支持
6. 手动改某用户角色 → 出现锁图标
7. 再次 AD 同步 → 锁定用户角色不变
8. 解锁 → AD 同步 → 角色恢复为 IT支持
9. 尝试删除被引用的自定义角色 → 被阻止

---

## 七、已知限制与后续

- **AD 嵌套组**：一期不展开嵌套组，只用 memberOf 直接返回的组
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
5. **删除阻断** — 被引用的角色不能删，避免用户突然失权
6. **Base path 一致** — 所有 API 在 `/woicrew/api/v1` 下
