# Role Management and AD Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-coded role management with database-backed built-in/custom roles, and map AD groups to roles instead of treating AD groups as roles.

**Architecture:** Add a `roles` table seeded with existing built-in roles. Refactor `role_service` to use DB roles as the source of truth while retaining constants only as seed/default data. Change `ad_role_mappings` to map `ad_group -> role_key`; update AD login/sync to apply the mapped role unless the user is manually locked.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.x AsyncSession, Alembic, SQLite/PostgreSQL/MySQL-compatible schema, React 18 + TypeScript + Vite + Tailwind CSS.

## Global Constraints

- Keep existing route base path behavior under `/woicrew/api/v1`.
- Preserve existing local users and AD users during migration.
- Preserve existing built-in role keys: `super_admin`, `skill_admin`, `ops_admin`, `docs_admin`, `viewer`.
- `super_admin` always has all menus and cannot be deleted.
- Manual role changes set `users.role_locked=true`.
- AD login/sync must not overwrite users with `role_locked=true`.
- Role deletion must be blocked when referenced by `user_roles` or `ad_role_mappings`.
- No AD nested-group expansion in this phase; use existing `memberOf` CN list only.
- No per-button/per-record permissions; menu-level permissions only.
- Do not store or log AD passwords.
- Do not commit unless the user explicitly authorizes commits in the current session.

---

## File Structure

### Backend files to create

- `backend/app/models/role.py` — SQLAlchemy model for database roles.
- `backend/alembic/versions/20260706_0013_roles_table.py` — migration creating/seeding roles and converting AD mappings to `role_key`.

### Backend files to modify

- `backend/app/models/__init__.py` — export `Role` so Alembic metadata sees it.
- `backend/app/models/ad_role_mapping.py` — replace dynamic-role fields with `role_key` + `priority`.
- `backend/app/auth/role_service.py` — DB-backed role CRUD, role lookup, menu lookup, deletion checks.
- `backend/app/auth/ad_role_service.py` — AD group mapping CRUD and resolver returning target role metadata.
- `backend/app/auth/adapters/ad.py` — apply mapped role key and target `is_admin`; default new AD users to `viewer` if no mapping.
- `backend/app/api/routes/users_admin.py` — role CRUD endpoints, updated mapping endpoints, user serialization, manual lock handling.
- `backend/app/api/routes/models_admin.py` — replace direct `ROLE_MENUS` iteration/validation with DB role list where model permissions are role-scoped.
- `backend/app/api/routes/users_client.py` — ensure role menu resolution remains DB-backed.

### Frontend files to modify

- `frontend/src/lib/user-api.ts` — add role types and role CRUD APIs; change AD mapping payload to `role_key`.
- `frontend/src/pages/admin/UserManagePage.tsx` — roles tab becomes full role manager; users and AD mappings use role API dropdowns.

---

### Task 1: Add `roles` model and migration

**Files:**
- Create: `backend/app/models/role.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/ad_role_mapping.py`
- Create: `backend/alembic/versions/20260706_0013_roles_table.py`

**Interfaces:**
- Produces model: `Role(key: str, label: str, is_system: bool, is_admin: bool, sort_order: int)`
- Produces changed model: `ADRoleMapping(ad_group: str, role_key: str, priority: int)`
- Later tasks consume `Role` and `ADRoleMapping.role_key`.

- [ ] **Step 1: Create the Role model**

Create `backend/app/models/role.py`:

```python
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Role(Base):
    """Database-backed role definition.

    Built-in and custom roles share this table. Menu permissions remain in
    role_menu_permissions keyed by roles.key.
    """

    __tablename__ = "roles"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Export Role from models package**

Modify `backend/app/models/__init__.py`:

```python
from app.models.role import Role
```

Add `"Role"` to `__all__`.

- [ ] **Step 3: Change AD role mapping model**

Replace `backend/app/models/ad_role_mapping.py` contents with:

```python
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ADRoleMapping(Base):
    """Maps an AD group CN to a database role key.

    When a user belongs to several mapped AD groups, the mapping with the
    highest priority wins. Ties are resolved by ad_group sort order in service code.
    """

    __tablename__ = "ad_role_mappings"

    ad_group: Mapped[str] = mapped_column(String(255), primary_key=True)
    role_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 4: Write migration 0013**

Create `backend/alembic/versions/20260706_0013_roles_table.py`:

```python
"""roles table and AD group role mapping conversion

Revision ID: 0013_roles
Revises: 0012_ad_role
Create Date: 2026-07-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_roles"
down_revision: str | None = "0012_ad_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BUILTIN_ROLES = [
    ("super_admin", "超级管理员", True, True, 10),
    ("skill_admin", "技能管理员", True, True, 20),
    ("ops_admin", "运维管理员", True, True, 30),
    ("docs_admin", "文档管理员", True, True, 40),
    ("viewer", "普通用户", True, False, 100),
]


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    roles = sa.table(
        "roles",
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("is_system", sa.Boolean),
        sa.column("is_admin", sa.Boolean),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        roles,
        [
            {
                "key": key,
                "label": label,
                "is_system": is_system,
                "is_admin": is_admin,
                "sort_order": sort_order,
            }
            for key, label, is_system, is_admin, sort_order in BUILTIN_ROLES
        ],
    )

    # Convert the earlier AD mapping shape from AD-group-as-role to AD-group -> role_key.
    with op.batch_alter_table("ad_role_mappings") as batch:
        batch.add_column(sa.Column("role_key", sa.String(64), nullable=True))

    op.execute(sa.text("UPDATE ad_role_mappings SET role_key = 'viewer' WHERE role_key IS NULL"))

    with op.batch_alter_table("ad_role_mappings") as batch:
        batch.alter_column("role_key", existing_type=sa.String(64), nullable=False)
        batch.create_index("ix_ad_role_mappings_role_key", ["role_key"])
        batch.drop_column("label")
        batch.drop_column("menu_keys")
        batch.drop_column("is_admin")


def downgrade() -> None:
    with op.batch_alter_table("ad_role_mappings") as batch:
        batch.add_column(sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("menu_keys", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("label", sa.String(255), nullable=True))
        batch.drop_index("ix_ad_role_mappings_role_key")
        batch.drop_column("role_key")
    op.drop_table("roles")
```

- [ ] **Step 5: Run migration and inspect schema**

Run:

```bash
cd backend
uv run alembic upgrade head
uv run alembic current
```

Expected output includes:

```text
0013_roles (head)
```

Run:

```bash
uv run python -c "
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models.role import Role

async def main():
    async with async_session_maker() as db:
        rows = (await db.scalars(select(Role).order_by(Role.sort_order))).all()
        print([(r.key, r.label, r.is_system, r.is_admin) for r in rows])
asyncio.run(main())
"
```

Expected output contains all five built-in role keys.

- [ ] **Step 6: Commit checkpoint only if authorized**

If the user has explicitly authorized commits, run:

```bash
git add backend/app/models/role.py backend/app/models/__init__.py backend/app/models/ad_role_mapping.py backend/alembic/versions/20260706_0013_roles_table.py
git commit -m "feat: add database-backed roles schema"
```

---

### Task 2: Refactor role service to use DB roles

**Files:**
- Modify: `backend/app/auth/role_service.py`

**Interfaces:**
- Consumes: `app.models.role.Role`
- Produces:
  - `async def list_roles(db: AsyncSession) -> list[Role]`
  - `async def get_role(db: AsyncSession, key: str) -> Role | None`
  - `async def ensure_builtin_roles(db: AsyncSession) -> None`
  - `async def create_role(db, *, key, label, is_admin, menu_keys) -> Role`
  - `async def update_role(db, *, key, label, is_admin, menu_keys) -> Role | None`
  - `async def delete_role(db, key: str) -> tuple[bool, str]`
  - `async def set_user_role(db, *, user_id, role) -> str | None`
  - `async def menus_for_role(db, role) -> list[str]`
  - `def serialize_role(role: Role, menu_keys: list[str], user_count: int = 0, ad_mapping_count: int = 0) -> dict[str, Any]`

- [ ] **Step 1: Replace role_service implementation**

Replace `backend/app/auth/role_service.py` with:

```python
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ad_role_mapping import ADRoleMapping
from app.models.role import Role
from app.models.role_menu_permission import RoleMenuPermission
from app.models.user_role import UserRole

ROLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")

ROLE_MENUS: dict[str, list[str]] = {
    "super_admin": ["home", "download", "docs", "skills", "skills.assignments", "devices", "releases", "docs.manage", "users.manage", "usage", "models.manage"],
    "skill_admin": ["home", "download", "docs", "skills", "skills.assignments"],
    "ops_admin": ["home", "download", "docs", "devices", "releases", "usage"],
    "docs_admin": ["home", "download", "docs", "docs.manage"],
    "viewer": ["home", "download", "docs"],
}

ALL_MENU_KEYS: list[dict[str, str]] = [
    {"key": "home", "label": "首页"},
    {"key": "download", "label": "下载中心"},
    {"key": "docs", "label": "文档查看"},
    {"key": "skills", "label": "技能中心"},
    {"key": "skills.assignments", "label": "技能权限配置"},
    {"key": "devices", "label": "设备管理"},
    {"key": "releases", "label": "客户端发布"},
    {"key": "docs.manage", "label": "文档管理"},
    {"key": "users.manage", "label": "用户管理"},
    {"key": "usage", "label": "用量分析"},
    {"key": "models.manage", "label": "模型权限管理"},
]

BUILTIN_ROLE_META: dict[str, dict[str, Any]] = {
    "super_admin": {"label": "超级管理员", "is_admin": True, "sort_order": 10},
    "skill_admin": {"label": "技能管理员", "is_admin": True, "sort_order": 20},
    "ops_admin": {"label": "运维管理员", "is_admin": True, "sort_order": 30},
    "docs_admin": {"label": "文档管理员", "is_admin": True, "sort_order": 40},
    "viewer": {"label": "普通用户", "is_admin": False, "sort_order": 100},
}

ADMIN_LIKE_ROLES = {k for k, v in BUILTIN_ROLE_META.items() if v["is_admin"]}
ROLE_LABELS = {k: str(v["label"]) for k, v in BUILTIN_ROLE_META.items()}
_VALID_MENU_KEYS = {m["key"] for m in ALL_MENU_KEYS}


def clean_role_key(key: str) -> str:
    return key.strip().lower()


def is_valid_role_key(key: str) -> bool:
    return bool(ROLE_KEY_RE.fullmatch(clean_role_key(key)))


def clean_menu_keys(menu_keys: list[str]) -> list[str]:
    out: list[str] = []
    for key in menu_keys:
        if key in _VALID_MENU_KEYS and key not in out:
            out.append(key)
    return out


def normalize_role(role: str | None) -> str:
    # Compatibility helper for old callers. New validation should use get_role().
    r = clean_role_key(role or "")
    return r or "viewer"


async def ensure_builtin_roles(db: AsyncSession) -> None:
    for key, meta in BUILTIN_ROLE_META.items():
        row = await db.get(Role, key)
        if row is None:
            row = Role(
                key=key,
                label=str(meta["label"]),
                is_system=True,
                is_admin=bool(meta["is_admin"]),
                sort_order=int(meta["sort_order"]),
            )
            db.add(row)
            await set_role_menu_config(db, key, ROLE_MENUS[key])
        else:
            row.is_system = True
            row.sort_order = int(meta["sort_order"])
    await db.flush()


async def list_roles(db: AsyncSession) -> list[Role]:
    await ensure_builtin_roles(db)
    rows = await db.scalars(select(Role).order_by(Role.sort_order, Role.key))
    return list(rows.all())


async def get_role(db: AsyncSession, key: str) -> Role | None:
    await ensure_builtin_roles(db)
    return await db.get(Role, clean_role_key(key))


async def get_user_role(db: AsyncSession, *, user_id: str, is_admin: bool) -> str:
    row = await db.scalar(select(UserRole.role).where(UserRole.user_id == user_id))
    if row and await get_role(db, str(row)) is not None:
        return str(row)
    return "super_admin" if is_admin else "viewer"


async def set_user_role(db: AsyncSession, *, user_id: str, role: str) -> str | None:
    nr = clean_role_key(role)
    if await get_role(db, nr) is None:
        return None
    existing = await db.get(UserRole, user_id)
    if existing:
        existing.role = nr
    else:
        db.add(UserRole(user_id=user_id, role=nr))
    return nr


async def set_user_role_raw(db: AsyncSession, *, user_id: str, role: str) -> str | None:
    return await set_user_role(db, user_id=user_id, role=role)


async def menus_for_role(db: AsyncSession, role: str) -> list[str]:
    nr = clean_role_key(role)
    if nr == "super_admin":
        return ROLE_MENUS["super_admin"]
    if await get_role(db, nr) is None:
        return ROLE_MENUS["viewer"]
    row = await db.get(RoleMenuPermission, nr)
    if row is not None:
        keys = [k.strip() for k in row.menu_keys.split(",") if k.strip()]
        return clean_menu_keys(keys)
    return ROLE_MENUS.get(nr, ROLE_MENUS["viewer"])


async def get_role_menu_config(db: AsyncSession, role: str) -> dict[str, Any]:
    nr = clean_role_key(role)
    r = await get_role(db, nr)
    if r is None:
        nr = "viewer"
    row = await db.get(RoleMenuPermission, nr)
    if row is not None:
        keys = clean_menu_keys([k.strip() for k in row.menu_keys.split(",") if k.strip()])
        return {"role": nr, "menu_keys": keys, "is_default": False}
    return {"role": nr, "menu_keys": ROLE_MENUS.get(nr, []), "is_default": True}


async def set_role_menu_config(db: AsyncSession, role: str, menu_keys: list[str]) -> None:
    nr = clean_role_key(role)
    clean = clean_menu_keys(menu_keys)
    existing = await db.get(RoleMenuPermission, nr)
    if existing:
        existing.menu_keys = ",".join(clean)
    else:
        db.add(RoleMenuPermission(role=nr, menu_keys=",".join(clean)))
    await db.flush()


async def create_role(
    db: AsyncSession,
    *,
    key: str,
    label: str,
    is_admin: bool,
    menu_keys: list[str],
) -> Role:
    nr = clean_role_key(key)
    if not is_valid_role_key(nr):
        raise ValueError("invalid_role_key")
    if await db.get(Role, nr) is not None:
        raise ValueError("duplicate_role_key")
    row = Role(key=nr, label=label.strip(), is_system=False, is_admin=is_admin, sort_order=200)
    db.add(row)
    await db.flush()
    await set_role_menu_config(db, nr, menu_keys)
    return row


async def update_role(
    db: AsyncSession,
    *,
    key: str,
    label: str,
    is_admin: bool,
    menu_keys: list[str],
) -> Role | None:
    row = await get_role(db, key)
    if row is None:
        return None
    row.label = label.strip()
    if not row.is_system or row.key != "super_admin":
        row.is_admin = is_admin
    await set_role_menu_config(db, row.key, menu_keys)
    await db.flush()
    return row


async def role_reference_counts(db: AsyncSession, role: str) -> tuple[int, int]:
    nr = clean_role_key(role)
    user_count = await db.scalar(select(func.count()).select_from(UserRole).where(UserRole.role == nr))
    mapping_count = await db.scalar(select(func.count()).select_from(ADRoleMapping).where(ADRoleMapping.role_key == nr))
    return int(user_count or 0), int(mapping_count or 0)


async def delete_role(db: AsyncSession, key: str) -> tuple[bool, str]:
    row = await get_role(db, key)
    if row is None:
        return False, "角色不存在"
    if row.is_system:
        return False, "系统内置角色不能删除"
    user_count, mapping_count = await role_reference_counts(db, row.key)
    if user_count:
        return False, f"该角色正在被 {user_count} 个用户使用，不能删除"
    if mapping_count:
        return False, f"该角色已被 {mapping_count} 个 AD 组映射引用，不能删除"
    menu = await db.get(RoleMenuPermission, row.key)
    if menu is not None:
        await db.delete(menu)
    await db.delete(row)
    await db.flush()
    return True, "角色已删除"


async def serialize_role(db: AsyncSession, role: Role) -> dict[str, Any]:
    menus = await menus_for_role(db, role.key)
    user_count, ad_mapping_count = await role_reference_counts(db, role.key)
    return {
        "key": role.key,
        "label": role.label,
        "is_system": role.is_system,
        "is_admin": role.is_admin,
        "sort_order": role.sort_order,
        "menu_keys": menus,
        "user_count": user_count,
        "ad_mapping_count": ad_mapping_count,
        "created_at": role.created_at.isoformat() if role.created_at else None,
        "updated_at": role.updated_at.isoformat() if role.updated_at else None,
    }


def serialize_role_payload(role: str, menu_permissions: list[str]) -> dict[str, Any]:
    return {"role": clean_role_key(role), "menu_permissions": menu_permissions}
```

- [ ] **Step 2: Run backend import check**

Run:

```bash
cd backend
uv run python -c "from app.main import create_app; create_app(); print('APP OK')"
```

Expected output contains:

```text
APP OK
```

- [ ] **Step 3: Verify service behavior with an in-memory script**

Run:

```bash
cd backend
uv run python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.db.base import Base
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.models.ad_role_mapping import ADRoleMapping
from app.auth.role_service import create_role, delete_role, ensure_builtin_roles, list_roles, menus_for_role, set_user_role

async def main():
    eng = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Sess = async_sessionmaker(eng, expire_on_commit=False)
    async with Sess() as db:
        await ensure_builtin_roles(db)
        roles = await list_roles(db)
        assert [r.key for r in roles][:5] == ['super_admin','skill_admin','ops_admin','docs_admin','viewer']
        custom = await create_role(db, key='it_support', label='IT支持', is_admin=True, menu_keys=['home','devices'])
        assert custom.key == 'it_support'
        assert await menus_for_role(db, 'it_support') == ['home','devices']
        ok, msg = await delete_role(db, 'super_admin')
        assert ok is False and '系统内置' in msg
        user = User(email='a@example.com')
        db.add(user); await db.flush()
        await set_user_role(db, user_id=user.id, role='it_support')
        ok, msg = await delete_role(db, 'it_support')
        assert ok is False and '用户使用' in msg
        await db.delete(await db.get(UserRole, user.id)); await db.flush()
        db.add(ADRoleMapping(ad_group='SG-IT', role_key='it_support', priority=10)); await db.flush()
        ok, msg = await delete_role(db, 'it_support')
        assert ok is False and 'AD 组映射' in msg
        print('ROLE SERVICE OK')
asyncio.run(main())
"
```

Expected output:

```text
ROLE SERVICE OK
```

- [ ] **Step 4: Commit checkpoint only if authorized**

If authorized:

```bash
git add backend/app/auth/role_service.py
git commit -m "feat: use database-backed roles"
```

---

### Task 3: Convert AD group mapping service and AD adapter to target roles

**Files:**
- Modify: `backend/app/auth/ad_role_service.py`
- Modify: `backend/app/auth/adapters/ad.py`

**Interfaces:**
- Consumes: `Role`, `ADRoleMapping.role_key`
- Produces:
  - `async def list_mappings(db) -> list[ADRoleMapping]`
  - `async def upsert_mapping(db, *, ad_group: str, role_key: str, priority: int) -> ADRoleMapping`
  - `async def resolve_role_from_groups(db, groups: list[str]) -> Role | None`
  - `def serialize_mapping(m: ADRoleMapping, role: Role | None) -> dict[str, Any]`

- [ ] **Step 1: Replace ad_role_service implementation**

Replace `backend/app/auth/ad_role_service.py` with:

```python
"""AD group -> database role mapping and resolution (006-ad-auth)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.role_service import get_role
from app.models.ad_role_mapping import ADRoleMapping
from app.models.role import Role


async def list_mappings(db: AsyncSession) -> list[ADRoleMapping]:
    rows = await db.scalars(
        select(ADRoleMapping).order_by(ADRoleMapping.priority.desc(), ADRoleMapping.ad_group)
    )
    return list(rows.all())


async def upsert_mapping(
    db: AsyncSession,
    *,
    ad_group: str,
    role_key: str,
    priority: int,
) -> ADRoleMapping:
    group = ad_group.strip()
    role = await get_role(db, role_key)
    if role is None:
        raise ValueError("role_not_found")
    row = await db.get(ADRoleMapping, group)
    if row is None:
        row = ADRoleMapping(ad_group=group, role_key=role.key, priority=priority)
        db.add(row)
    else:
        row.role_key = role.key
        row.priority = priority
    await db.flush()
    return row


async def delete_mapping(db: AsyncSession, ad_group: str) -> bool:
    row = await db.get(ADRoleMapping, ad_group.strip())
    if row is None:
        return False
    await db.delete(row)
    await db.flush()
    return True


async def resolve_role_from_groups(db: AsyncSession, groups: list[str]) -> Role | None:
    if not groups:
        return None
    group_set = set(groups)
    rows = await list_mappings(db)
    for mapping in rows:
        if mapping.ad_group not in group_set:
            continue
        role = await get_role(db, mapping.role_key)
        if role is not None:
            return role
    return None


async def serialize_mapping(db: AsyncSession, m: ADRoleMapping) -> dict[str, Any]:
    role = await get_role(db, m.role_key)
    return {
        "ad_group": m.ad_group,
        "role_key": m.role_key,
        "role_label": role.label if role else m.role_key,
        "priority": m.priority,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
```

- [ ] **Step 2: Update AD adapter role application**

In `backend/app/auth/adapters/ad.py`, replace `_apply_ad_role` with:

```python
async def _apply_ad_role(db: AsyncSession, user: User, groups: list[str], *, is_new: bool = False) -> None:
    """Set the user's role from mapped AD groups unless the role is manually locked."""
    if user.role_locked:
        return
    role = await resolve_role_from_groups(db, groups)
    if role is None:
        if is_new:
            viewer = await get_role(db, "viewer")
            if viewer is not None:
                await set_user_role(db, user_id=user.id, role="viewer")
                user.is_admin = viewer.is_admin
        return
    await set_user_role(db, user_id=user.id, role=role.key)
    user.is_admin = role.is_admin
```

Update imports in the same file:

```python
from app.auth.role_service import get_role, set_user_role
```

Remove import of `set_user_role_raw`.

Update the new-user call:

```python
await _apply_ad_role(db, user, attrs.groups, is_new=True)
```

Update the existing-user call:

```python
await _apply_ad_role(db, user, attrs.groups)
```

- [ ] **Step 3: Run AD role mapping behavior script**

Run:

```bash
cd backend
uv run python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.db.base import Base
from app.auth.role_service import create_role, get_user_role, ensure_builtin_roles
from app.auth.ad_role_service import upsert_mapping, resolve_role_from_groups
from app.auth.adapters.ad import sync_user_from_ad
from app.services.ad_client import ADUserAttrs

async def main():
    eng = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Sess = async_sessionmaker(eng, expire_on_commit=False)
    async with Sess() as db:
        await ensure_builtin_roles(db)
        await create_role(db, key='it_support', label='IT支持', is_admin=True, menu_keys=['home','devices'])
        await upsert_mapping(db, ad_group='SG-IT', role_key='it_support', priority=100)
        await upsert_mapping(db, ad_group='SG-Ambilight User', role_key='viewer', priority=10)
        role = await resolve_role_from_groups(db, ['SG-Ambilight User','SG-IT'])
        assert role and role.key == 'it_support' and role.is_admin is True
        user = await sync_user_from_ad(db, ADUserAttrs(ad_guid='g1', sam_account_name='songchao', groups=['SG-IT']))
        await db.flush()
        assert await get_user_role(db, user_id=user.id, is_admin=user.is_admin) == 'it_support'
        assert user.is_admin is True
        user.role_locked = True
        await db.flush()
        locked = await sync_user_from_ad(db, ADUserAttrs(ad_guid='g1', sam_account_name='songchao', groups=['SG-Ambilight User']))
        assert await get_user_role(db, user_id=locked.id, is_admin=locked.is_admin) == 'it_support'
        print('AD ROLE MAPPING OK')
asyncio.run(main())
"
```

Expected output:

```text
AD ROLE MAPPING OK
```

- [ ] **Step 4: Commit checkpoint only if authorized**

If authorized:

```bash
git add backend/app/auth/ad_role_service.py backend/app/auth/adapters/ad.py
git commit -m "feat: map AD groups to database roles"
```

---

### Task 4: Add role CRUD and update admin APIs

**Files:**
- Modify: `backend/app/api/routes/users_admin.py`
- Modify: `backend/app/api/routes/models_admin.py`

**Interfaces:**
- Consumes role service from Task 2 and AD mapping service from Task 3.
- Produces endpoints:
  - `GET /api/v1/admin/users/roles`
  - `POST /api/v1/admin/users/roles`
  - `PATCH /api/v1/admin/users/roles/{role_key}`
  - `DELETE /api/v1/admin/users/roles/{role_key}`
  - updated `GET/POST/DELETE /api/v1/admin/users/ad-role-mappings`

- [ ] **Step 1: Update imports in users_admin.py**

In `backend/app/api/routes/users_admin.py`, replace current role imports with:

```python
from app.auth.ad_role_service import delete_mapping, list_mappings, serialize_mapping, upsert_mapping
from app.auth.role_service import (
    ALL_MENU_KEYS,
    clean_role_key,
    create_role,
    delete_role,
    get_role,
    get_role_menu_config,
    get_user_role,
    list_roles,
    menus_for_role,
    serialize_role,
    set_role_menu_config,
    set_user_role,
    update_role,
)
from app.models.role import Role
```

Remove imports of `ADMIN_LIKE_ROLES`, `ROLE_LABELS`, `ROLE_MENUS`, `normalize_role`, and `ADRoleMapping`.

- [ ] **Step 2: Add request bodies**

Replace `UserRolePatchBody`, `UserCreateBody`, `UserPatchBody`, and add `RoleBody`, `ADRoleMappingBody`:

```python
class UserRolePatchBody(BaseModel):
    role: str = Field(..., min_length=3, max_length=64)


class UserCreateBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=255)
    role: str = Field(default="viewer", min_length=3, max_length=64)


class UserPatchBody(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: str | None = Field(default=None, min_length=3, max_length=64)


class RoleBody(BaseModel):
    key: str | None = Field(default=None, min_length=3, max_length=64)
    label: str = Field(..., min_length=1, max_length=255)
    is_admin: bool = False
    menu_keys: list[str] = Field(default_factory=list)


class RoleMenuBody(BaseModel):
    menu_keys: list[str] = Field(...)


class ADRoleMappingBody(BaseModel):
    ad_group: str = Field(..., min_length=1, max_length=255)
    role_key: str = Field(..., min_length=3, max_length=64)
    priority: int = Field(default=0, ge=0, le=1000)
```

- [ ] **Step 3: Update `_serialize_user`**

Replace role label lookup with DB role lookup:

```python
async def _serialize_user(db: AsyncSession, u: User) -> dict[str, Any]:
    role_key = await get_user_role(db, user_id=u.id, is_admin=u.is_admin)
    role = await get_role(db, role_key)
    menu_permissions = await menus_for_role(db, role_key)
    role_label = role.label if role else role_key
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "display_name": u.display_name,
        "department": u.department,
        "title": u.title,
        "avatar_url": u.avatar_url,
        "is_admin": u.is_admin,
        "role": role_key,
        "role_label": role_label,
        "role_locked": u.role_locked,
        "source": "ad" if u.ad_guid else "local",
        "menu_permissions": menu_permissions,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }
```

- [ ] **Step 4: Update create/edit user role assignment**

In `create_user`, replace role handling with:

```python
role = await get_role(db, body.role)
if role is None:
    return rc_err("角色不存在")
u = User(
    email=body.email,
    password_hash=hash_password(body.password),
    display_name=body.display_name,
    is_admin=role.is_admin,
)
```

After flush:

```python
await set_user_role(db, user_id=u.id, role=role.key)
```

In `patch_user` and `patch_user_role`, replace role handling with:

```python
role = await get_role(db, body.role)
if role is None:
    return rc_err("角色不存在")
if u.id == admin.id and not role.is_admin:
    return rc_err("不能将自己降级为非管理角色")
u.is_admin = role.is_admin
await set_user_role(db, user_id=u.id, role=role.key)
u.role_locked = True
```

- [ ] **Step 5: Add role CRUD endpoints before AD mappings**

Insert after user delete endpoint:

```python
@router.get("/roles")
async def list_roles_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    rows = await list_roles(db)
    return rc_ok({"items": [await serialize_role(db, r) for r in rows], "all_menus": ALL_MENU_KEYS})


@router.post("/roles")
async def create_role_endpoint(
    body: RoleBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    if not body.key:
        return rc_err("角色标识不能为空")
    try:
        row = await create_role(
            db,
            key=body.key,
            label=body.label,
            is_admin=body.is_admin,
            menu_keys=body.menu_keys,
        )
    except ValueError as exc:
        if str(exc) == "duplicate_role_key":
            return rc_err("角色标识已存在")
        return rc_err("角色标识只能使用小写字母、数字和下划线，且至少 3 位")
    await db.commit()
    await db.refresh(row)
    return rc_ok(await serialize_role(db, row), message="角色已创建")


@router.patch("/roles/{role_key}")
async def update_role_endpoint(
    role_key: str,
    body: RoleBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    row = await update_role(
        db,
        key=role_key,
        label=body.label,
        is_admin=body.is_admin,
        menu_keys=body.menu_keys,
    )
    if row is None:
        return rc_err("角色不存在")
    await db.commit()
    await db.refresh(row)
    return rc_ok(await serialize_role(db, row), message="角色已更新")


@router.delete("/roles/{role_key}")
async def delete_role_endpoint(
    role_key: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    ok, message = await delete_role(db, role_key)
    if not ok:
        return rc_err(message)
    await db.commit()
    return rc_ok(message=message)
```

- [ ] **Step 6: Update role menu permission endpoints**

Change `list_role_menu_permissions` to read from DB roles:

```python
rows = await list_roles(db)
items = []
for role in rows:
    cfg = await get_role_menu_config(db, role.key)
    cfg["label"] = role.label
    cfg["is_system"] = role.is_system
    cfg["is_admin"] = role.is_admin
    items.append(cfg)
return rc_ok({"items": items, "all_menus": ALL_MENU_KEYS})
```

Change `set_role_menu_perms` validation:

```python
role_row = await get_role(db, role)
if role_row is None:
    return rc_err("角色不存在")
if role_row.key == "super_admin":
    return rc_err("super_admin 始终拥有全部权限，不可修改")
await set_role_menu_config(db, role_row.key, body.menu_keys)
```

- [ ] **Step 7: Update AD mapping endpoints**

Replace mapping body and handlers to use `role_key`:

```python
@router.get("/ad-role-mappings")
async def list_ad_role_mappings(...):
    rows = await list_mappings(db)
    return rc_ok({"items": [await serialize_mapping(db, m) for m in rows]})

@router.post("/ad-role-mappings")
async def upsert_ad_role_mapping(...):
    try:
        m = await upsert_mapping(db, ad_group=body.ad_group, role_key=body.role_key, priority=body.priority)
    except ValueError:
        return rc_err("角色不存在")
    await db.commit()
    await db.refresh(m)
    return rc_ok(await serialize_mapping(db, m), message="映射已保存")
```

- [ ] **Step 8: Update models_admin.py role usage**

In `backend/app/api/routes/models_admin.py`, replace `for role in ROLE_MENUS:` loops with DB-backed roles in route functions that already receive `db`.

Use this pattern:

```python
from app.auth.role_service import list_roles

roles = [r.key for r in await list_roles(db)]
for role in roles:
    ...
```

For role validation:

```python
from app.auth.role_service import get_role

if await get_role(db, role) is None:
    return rc_err("角色不存在")
```

- [ ] **Step 9: Verify route registration and API behavior**

Run:

```bash
cd backend
uv run python -c "from app.main import create_app; app=create_app(); print([r.path for r in app.routes if '/admin/users/roles' in r.path])"
```

Expected output includes:

```text
/woicrew/api/v1/admin/users/roles
/woicrew/api/v1/admin/users/roles/{role_key}
/woicrew/api/v1/admin/users/roles/menu-permissions
/woicrew/api/v1/admin/users/roles/{role}/menu-permissions
```

- [ ] **Step 10: Commit checkpoint only if authorized**

If authorized:

```bash
git add backend/app/api/routes/users_admin.py backend/app/api/routes/models_admin.py
git commit -m "feat: add role management admin APIs"
```

---

### Task 5: Update frontend API types and UserManagePage UI

**Files:**
- Modify: `frontend/src/lib/user-api.ts`
- Modify: `frontend/src/pages/admin/UserManagePage.tsx`

**Interfaces:**
- Consumes backend APIs from Task 4.
- Produces UI flows:
  - roles list/create/edit/delete
  - users role dropdown sourced from roles API
  - AD mappings select AD group + target role

- [ ] **Step 1: Update frontend API types and functions**

In `frontend/src/lib/user-api.ts`, replace role and AD mapping types with:

```ts
export type RoleItem = {
  key: string;
  label: string;
  is_system: boolean;
  is_admin: boolean;
  sort_order: number;
  menu_keys: string[];
  user_count: number;
  ad_mapping_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export type ADRoleMappingItem = {
  ad_group: string;
  role_key: string;
  role_label: string;
  priority: number;
  updated_at: string | null;
};
```

Add role API functions:

```ts
export async function listRoles(): Promise<RcResponse<{ items: RoleItem[]; all_menus: MenuKeyItem[] }>> {
  return getJson("/admin/users/roles");
}

export async function createRole(body: {
  key: string;
  label: string;
  is_admin: boolean;
  menu_keys: string[];
}): Promise<RcResponse<RoleItem>> {
  return postJson("/admin/users/roles", body);
}

export async function updateRole(
  key: string,
  body: { label: string; is_admin: boolean; menu_keys: string[] },
): Promise<RcResponse<RoleItem>> {
  return patchJson(`/admin/users/roles/${encodeURIComponent(key)}`, body);
}

export async function deleteRole(key: string): Promise<RcResponse<unknown>> {
  return deleteJson(`/admin/users/roles/${encodeURIComponent(key)}`);
}
```

Change AD mapping upsert body:

```ts
export async function upsertAdRoleMapping(body: {
  ad_group: string;
  role_key: string;
  priority: number;
}): Promise<RcResponse<ADRoleMappingItem>> {
  return postJson("/admin/users/ad-role-mappings", body);
}
```

- [ ] **Step 2: Update UserManagePage imports/state**

In `frontend/src/pages/admin/UserManagePage.tsx`, import:

```ts
createRole,
updateRole,
deleteRole,
listRoles,
type RoleItem,
```

Replace hard-coded `ROLES`, `ROLE_LABELS`, and `ROLE_COLORS` usage with `roles: RoleItem[]` state:

```ts
const [roles, setRoles] = useState<RoleItem[]>([]);
const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
const [roleForm, setRoleForm] = useState({ key: "", label: "", is_admin: false, menu_keys: [] as string[] });
```

Keep a small color helper:

```ts
function roleColor(role: string) {
  if (role === "super_admin") return "bg-purple-50 text-purple-700 border-purple-200";
  if (role === "viewer") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-indigo-50 text-indigo-700 border-indigo-200";
}
```

- [ ] **Step 3: Add role loading helper**

Add:

```ts
async function loadRoles() {
  const res = await listRoles();
  if (res.rc === 0 && res.data) {
    setRoles(res.data.items);
    if (allMenus.length === 0) setAllMenus(res.data.all_menus);
  } else {
    flash("error", res.message || "角色加载失败");
  }
}
```

Call `loadRoles()` in the initial effect alongside `load()`.

- [ ] **Step 4: Update user role dropdowns**

Replace `ROLES.map(...)` in create/edit forms with:

```tsx
{roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
```

Update `startEdit`:

```ts
role: editingUser.role || "viewer"
```

Do not collapse custom roles to viewer.

- [ ] **Step 5: Replace roles tab with role manager**

Render role cards/table from `roles`:

```tsx
{roles.map((r) => (
  <tr key={r.key}>
    <td>{r.label}<div className="font-mono text-xs text-slate-400">{r.key}</div></td>
    <td>{r.is_system ? "系统" : "自定义"}</td>
    <td>{r.is_admin ? "是" : "否"}</td>
    <td>{r.user_count}</td>
    <td>{r.ad_mapping_count}</td>
    <td>
      <button onClick={() => setEditingRole(r)}>编辑</button>
      {!r.is_system && <button onClick={() => void onDeleteRole(r)}>删除</button>}
    </td>
  </tr>
))}
```

Add handler:

```ts
async function onDeleteRole(role: RoleItem) {
  if (!confirm(`删除角色「${role.label}」？`)) return;
  const res = await deleteRole(role.key);
  flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已删除" : "删除失败"));
  if (res.rc === 0) await loadRoles();
}
```

- [ ] **Step 6: Add role edit modal**

Create modal that supports create/edit:

```tsx
{editingRole && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40" onClick={() => setEditingRole(null)} />
    <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-5 mx-4">
      <h3 className="text-base font-bold text-slate-900">{editingRole.key ? "编辑角色" : "新增角色"}</h3>
      {/* key disabled when editing existing role; label, is_admin, menu checkboxes */}
    </div>
  </div>
)}
```

Save handler:

```ts
async function saveRole() {
  const body = { label: roleForm.label, is_admin: roleForm.is_admin, menu_keys: roleForm.menu_keys };
  const res = editingRole?.key
    ? await updateRole(editingRole.key, body)
    : await createRole({ key: roleForm.key, ...body });
  flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已保存" : "保存失败"));
  if (res.rc === 0) { setEditingRole(null); await loadRoles(); }
}
```

- [ ] **Step 7: Update AD mapping tab**

Change mapping table columns to show target role:

```tsx
<td>{m.ad_group}</td>
<td>{m.role_label}<div className="font-mono text-xs text-slate-400">{m.role_key}</div></td>
<td>{m.priority}</td>
```

Change modal state to `role_key`, not `menu_keys/is_admin/label`:

```ts
setEditingMapping({ ad_group: "", role_key: roles[0]?.key || "viewer", role_label: "", priority: 0, updated_at: null })
```

Change role dropdown:

```tsx
<select value={m.role_key} onChange={(e) => setM({ role_key: e.target.value })}>
  {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
</select>
```

Save mapping:

```ts
const res = await upsertAdRoleMapping({ ad_group: m.ad_group.trim(), role_key: m.role_key, priority: m.priority });
```

- [ ] **Step 8: Build frontend**

Run:

```bash
cd frontend
npm run build
```

Expected output ends with:

```text
✓ built
```

- [ ] **Step 9: Commit checkpoint only if authorized**

If authorized:

```bash
git add frontend/src/lib/user-api.ts frontend/src/pages/admin/UserManagePage.tsx
git commit -m "feat: manage roles and AD role mappings in UI"
```

---

### Task 6: End-to-end verification and cleanup

**Files:**
- Review changed backend/frontend files.
- No new files expected unless a previous task identified a bug.

**Interfaces:**
- Consumes completed Tasks 1-5.
- Produces verified working role management + AD mapping behavior.

- [ ] **Step 1: Run backend focused lint**

Run:

```bash
cd backend
uv run ruff check app/models/role.py app/models/ad_role_mapping.py app/auth/role_service.py app/auth/ad_role_service.py app/auth/adapters/ad.py app/api/routes/users_admin.py app/api/routes/models_admin.py app/api/routes/users_client.py
```

Expected output:

```text
All checks passed!
```

If repo-wide `ruff check app/` still reports unrelated legacy errors, do not fix unrelated files in this task; report them separately.

- [ ] **Step 2: Run backend import and migration checks**

Run:

```bash
cd backend
uv run python -c "from app.main import create_app; create_app(); print('APP OK')"
uv run alembic current
```

Expected output contains:

```text
APP OK
0013_roles (head)
```

- [ ] **Step 3: Run role service integration script against local DB**

Run:

```bash
cd backend
uv run python -c "
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.auth.role_service import list_roles, create_role, delete_role

async def main():
    async with async_session_maker() as db:
        roles = await list_roles(db)
        assert any(r.key == 'viewer' for r in roles)
        if not any(r.key == 'qa_test_role' for r in roles):
            await create_role(db, key='qa_test_role', label='QA测试角色', is_admin=False, menu_keys=['home','docs'])
            await db.commit()
        ok, message = await delete_role(db, 'qa_test_role')
        assert ok, message
        await db.commit()
        print('LOCAL ROLE CRUD OK')
asyncio.run(main())
"
```

Expected output:

```text
LOCAL ROLE CRUD OK
```

- [ ] **Step 4: Verify AD group list still works**

Run:

```bash
cd backend
uv run python -c "from app.core.config import get_settings; from app.services.ad_client import ADClient; groups=ADClient(get_settings()).list_groups(); print(len(groups)); print(groups[:3])"
```

Expected: count greater than 0 and group dicts with `cn`.

- [ ] **Step 5: Verify AD mapping resolves to role**

Run:

```bash
cd backend
uv run python -c "
import asyncio
from app.db.session import async_session_maker
from app.auth.role_service import create_role, list_roles
from app.auth.ad_role_service import upsert_mapping, resolve_role_from_groups

async def main():
    async with async_session_maker() as db:
        roles = await list_roles(db)
        if not any(r.key == 'qa_ad_role' for r in roles):
            await create_role(db, key='qa_ad_role', label='QA AD角色', is_admin=False, menu_keys=['home'])
        await upsert_mapping(db, ad_group='QA-Nonexistent-Test-Group', role_key='qa_ad_role', priority=999)
        role = await resolve_role_from_groups(db, ['QA-Nonexistent-Test-Group'])
        assert role and role.key == 'qa_ad_role'
        await db.rollback()
        print('AD MAPPING RESOLVE OK')
asyncio.run(main())
"
```

Expected output:

```text
AD MAPPING RESOLVE OK
```

Rollback ensures no QA artifacts persist.

- [ ] **Step 6: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected output ends with:

```text
✓ built
```

- [ ] **Step 7: Manual browser smoke test**

Start backend/frontend using the project commands:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

In another terminal:

```bash
cd frontend
npm run dev
```

In the browser, verify:

1. Open `/woicrew/login` and log in as admin.
2. Open user management.
3. Roles tab shows five seeded roles.
4. Create custom role `it_support` with menus `home`, `devices`.
5. AD mapping tab shows AD group dropdown populated from AD.
6. Map `SG-IT` to `it_support` with priority `100`.
7. Run AD sync.
8. User belonging to `SG-IT` shows role `IT支持`.
9. Manually change that user's role to `viewer`; lock icon appears.
10. Run AD sync again; role remains `viewer` while locked.
11. Click unlock and run AD sync; role returns to `IT支持`.
12. Try deleting `it_support` while mapping exists; deletion is blocked.

- [ ] **Step 8: Final status report**

Report:

- Migration status.
- Backend checks run and results.
- Frontend build result.
- Manual smoke test result or what could not be tested.
- Any unrelated pre-existing lint failures, if encountered.

- [ ] **Step 9: Commit final checkpoint only if authorized**

If authorized:

```bash
git status --short
git add backend frontend docs/superpowers/specs/2026-07-06-role-management-ad-mapping-design.md docs/superpowers/plans/2026-07-06-role-management-ad-mapping-plan.md
git commit -m "feat: add custom roles and AD group role mappings"
```

---

## Self-Review

### Spec coverage

- Roles table and seeded built-ins: Task 1.
- Role CRUD and deletion safety: Task 2 and Task 4.
- AD group maps to role_key, not permissions: Task 1 and Task 3.
- AD login/sync respects role_locked and defaults new unmapped users to viewer: Task 3.
- Admin APIs: Task 4.
- Frontend role manager and AD mapping UI: Task 5.
- End-to-end verification: Task 6.

### Placeholder scan

No unresolved blanks are used. Each task names files, interfaces, commands, and expected outputs.

### Type consistency

The plan consistently uses `Role.key`, `ADRoleMapping.role_key`, frontend `RoleItem.key`, and frontend `ADRoleMappingItem.role_key`. Backend role CRUD functions return SQLAlchemy `Role` objects and serialization returns dictionaries for API responses.
