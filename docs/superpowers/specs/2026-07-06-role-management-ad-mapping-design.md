# Role Management and AD Group Mapping Design

## Context

CrewCentral currently uses a small hard-coded role set (`super_admin`, `skill_admin`, `ops_admin`, `docs_admin`, `viewer`) plus menu permissions. AD integration was added so users can log in with AD accounts, sync AD profile attributes, and derive a role from AD group membership. The first AD-group implementation treated each AD group as a dynamic role. That works technically, but it does not match the product direction: permissions are still managed as system roles, and administrators need to associate AD groups with built-in or custom roles.

This design upgrades the permission model to make roles first-class database entities. AD groups map to roles, not directly to permissions. Administrators can create, rename, configure, and delete custom roles from the UI. Deleting a role that is used by users or AD mappings is blocked to avoid silent permission loss.

## Goals

- AD groups can be mapped to existing built-in roles or custom roles.
- Administrators can create, rename, configure, and delete custom roles in the UI.
- Built-in roles remain available and protected from destructive changes.
- User role assignment remains compatible with existing local users and AD users.
- AD login/sync applies AD-derived roles only when the user role is not manually locked.
- Role deletion is safe: block deletion when the role is referenced by users or AD mappings.

## Non-goals

- No group nesting expansion in AD beyond the `memberOf` values returned by AD in this phase.
- No per-button or per-record permissions; this remains menu-level role permissions.
- No automatic migration of model permissions or skill-specific permissions beyond preserving existing role keys.

## Recommended Architecture

### Roles table

Add a `roles` table:

```text
roles
- key: string primary key
- label: string
- is_system: bool
- is_admin: bool
- sort_order: int
- created_at
- updated_at
```

Seed the current built-in roles into this table:

```text
super_admin   超级管理员   is_system=true   is_admin=true
skill_admin   技能管理员   is_system=true   is_admin=true
ops_admin     运维管理员   is_system=true   is_admin=true
docs_admin    文档管理员   is_system=true   is_admin=true
viewer        普通用户     is_system=true   is_admin=false
```

`super_admin` is special: it always has every menu permission and cannot be deleted.

### Role permissions

Reuse the existing `role_menu_permissions` table:

```text
role_menu_permissions
- role
- menu_keys
```

The `role` column continues to store the role key. Existing built-in defaults remain available as fallback defaults during migration, but normal permission lookup should load from `roles` + `role_menu_permissions`.

For custom roles, the UI writes menu permissions explicitly.

### User roles

Keep the existing `user_roles` table:

```text
user_roles
- user_id
- role
```

The stored role value must refer to `roles.key`.

`users.role_locked` remains the manual override flag:

- `role_locked=false`: AD login/sync may update the role from AD group mappings.
- `role_locked=true`: AD login/sync must not overwrite the user role.

Manual role changes from the user management UI set `role_locked=true`.

### AD group mappings

Change `ad_role_mappings` from "AD group is role" to "AD group maps to role":

```text
ad_role_mappings
- ad_group: string primary key     # AD group CN
- role_key: string                 # FK-like reference to roles.key
- priority: int                    # higher wins when multiple groups match
- updated_at
```

The mapping no longer stores `menu_keys` or `is_admin`; those belong to the target role.

When a user belongs to multiple mapped AD groups, choose the mapping with the highest `priority`. If priorities tie, sort by `ad_group` to keep behavior deterministic.

If no AD group mapping matches, leave the user role unchanged for existing users. New AD users fall back to `viewer`.

## Backend Components

### `app.models.role.Role`

New SQLAlchemy model for roles.

### Migration

Add a migration to:

1. Create `roles`.
2. Seed built-in roles.
3. Alter `ad_role_mappings`:
   - add `role_key`
   - migrate existing rows by mapping `ad_group` to an existing role only if one exists; otherwise default `role_key='viewer'`
   - remove old `label`, `menu_keys`, `is_admin` fields if present
4. Ensure `users.role_locked` remains intact.

SQLite batch mode is needed for dropping/changing columns.

### `auth.role_service`

Replace hard-coded role validation with DB-backed functions:

- `list_roles(db)`
- `get_role(db, key)`
- `create_role(db, key, label, is_admin, menu_keys)`
- `update_role(db, key, label, is_admin, menu_keys)`
- `delete_role(db, key)` with reference checks
- `get_user_role(db, user_id, is_admin)` remains compatible but validates against `roles`
- `menus_for_role(db, role)` loads from `role_menu_permissions`, with `super_admin` returning all menus

Keep `ROLE_MENUS` and `ROLE_LABELS` as seed/default constants only, not as the source of truth.

### `auth.ad_role_service`

Update mapping logic:

- `list_mappings(db)` returns `ad_group`, `role_key`, `role_label`, `priority`.
- `upsert_mapping(db, ad_group, role_key, priority)` validates that `role_key` exists.
- `resolve_role_from_groups(db, groups)` returns the target role from the highest-priority mapping.

### `auth.adapters.ad.sync_user_from_ad`

Role application becomes:

```text
if user.role_locked:
  keep manual role
else if resolve_role_from_groups(...) returns role:
  set user role to role.key and user.is_admin = role.is_admin
else if user is new:
  set role viewer
else:
  keep current role
```

### Admin APIs

Add/update endpoints under `admin/users`:

#### Roles

```text
GET    /admin/users/roles
POST   /admin/users/roles
PATCH  /admin/users/roles/{role_key}
DELETE /admin/users/roles/{role_key}
```

Deletion rules:

- Block deletion of `is_system=true` roles.
- Block deletion if any `user_roles.role` references it.
- Block deletion if any `ad_role_mappings.role_key` references it.

#### Role menu permissions

Existing menu permission endpoints can be kept for compatibility but should use the new `roles` table as the role list source.

#### AD mappings

```text
GET    /admin/users/ad-role-mappings
POST   /admin/users/ad-role-mappings
DELETE /admin/users/ad-role-mappings/{ad_group}
```

Payload changes from menu permissions to target role:

```json
{
  "ad_group": "SG-IT",
  "role_key": "ops_admin",
  "priority": 100
}
```

#### Users

User serialization includes:

- `role`
- `role_label`
- `role_locked`
- `source`
- `menu_permissions`

Manual role edits set `role_locked=true`. Unlock endpoint keeps current behavior.

## Frontend Design

### User management tab

- Search by display name, email, username, role label.
- Filter by role from the `roles` API, not a hard-coded list.
- Filter by source: AD/local.
- Role badges use role label and fallback to role key.
- Manual role change uses a role dropdown from the `roles` API.
- AD users still cannot have local password edited.
- Locked users show a lock indicator and an "unlock" action.

### Role management tab

Replace the current fixed-role panel with a real role manager:

- List roles with label, key, system/custom, admin flag, and menu permissions.
- Add role:
  - key
  - label
  - is_admin
  - menu permissions
- Edit role:
  - label
  - is_admin (disabled for system roles if needed)
  - menu permissions
- Delete custom role:
  - disabled or blocked when referenced
  - blocked system roles show a reason

### AD group mapping tab

- AD group dropdown comes from `GET /ad-auth/admin/ad/groups`.
- Role dropdown comes from `GET /admin/users/roles`.
- Priority input remains.
- Menu permissions are not edited here; they are edited on the target role.
- Mapping list shows AD group, target role label/key, priority.

## Data Flow

### AD login or sync

```text
AD user authenticated/synced
  -> parse username and memberOf groups
  -> find or create local user
  -> if role_locked: keep role
  -> else resolve AD group mapping by priority
  -> if mapping found: set user_roles.role = mapping.role_key, is_admin = role.is_admin
  -> if new user and no mapping: set viewer
```

### Admin role edit

```text
Admin edits role permissions
  -> update roles metadata
  -> update role_menu_permissions
  -> users with that role see updated permissions on next userinfo/API permission check
```

### Delete role

```text
Admin requests delete
  -> reject if system role
  -> reject if user_roles references role
  -> reject if ad_role_mappings references role
  -> otherwise delete role + menu permissions
```

## Error Handling

- AD group list failures show a user-safe error from existing AD error handling.
- Invalid role keys return `rc_err("角色不存在")`.
- Duplicate role keys return `rc_err("角色标识已存在")`.
- Deleting referenced roles returns a specific message, e.g. `该角色正在被 3 个用户使用，不能删除` or `该角色已被 AD 组映射引用，不能删除`.
- If an AD mapping references a role that somehow no longer exists, sync ignores that mapping and logs a warning.

## Testing and Verification

### Backend

- Alembic upgrade from current DB succeeds.
- Seeded roles exist after migration.
- Existing users keep their roles.
- Custom role CRUD works.
- Deleting system roles is blocked.
- Deleting roles referenced by `user_roles` is blocked.
- Deleting roles referenced by `ad_role_mappings` is blocked.
- AD group priority resolution returns the target `role_key`.
- Locked users are not overwritten by AD sync.
- Unlocked AD users receive mapped roles.
- `menus_for_role` works for built-in and custom roles.

### Frontend

- `npm run build` passes.
- Role list loads from API.
- User role dropdown shows custom roles.
- AD mapping form uses AD group dropdown + role dropdown.
- Creating a role, mapping an AD group to it, running AD sync, and checking the user list shows the expected role.

## Implementation Notes

This is a medium-sized refactor. The safest sequence is:

1. Add roles table and seed built-ins.
2. Refactor backend role service to read roles from DB while keeping existing constants as defaults.
3. Convert AD mappings to `ad_group -> role_key`.
4. Update admin APIs.
5. Update frontend APIs.
6. Refactor UserManagePage role and AD mapping tabs.
7. Run real AD sync smoke test.
