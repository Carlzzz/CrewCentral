import { apiPrefix, deleteJson, getJson, patchJson, postJson, type RcResponse } from "./api";

export type AdminUserItem = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  department: string | null;
  title: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role: string;
  role_label: string;
  role_locked: boolean;
  source: "ad" | "local";
  menu_permissions: string[];
  created_at: string | null;
  updated_at: string | null;
};

export async function listAdminUsers(): Promise<RcResponse<{ items: AdminUserItem[] }>> {
  return getJson("/admin/users");
}

export async function patchAdminUserRole(
  userId: string,
  role: string,
): Promise<RcResponse<AdminUserItem>> {
  return patchJson(`/admin/users/${encodeURIComponent(userId)}/role`, { role });
}

export async function createAdminUser(body: {
  email: string;
  password: string;
  display_name?: string;
  role: string;
}): Promise<RcResponse<AdminUserItem>> {
  return postJson("/admin/users", body);
}

export async function patchAdminUser(
  userId: string,
  body: { email?: string; password?: string; display_name?: string; role?: string },
): Promise<RcResponse<AdminUserItem>> {
  return patchJson(`/admin/users/${encodeURIComponent(userId)}`, body);
}

export async function deleteAdminUser(userId: string): Promise<RcResponse<unknown>> {
  return deleteJson(`/admin/users/${encodeURIComponent(userId)}`);
}

export async function unlockUserRole(userId: string): Promise<RcResponse<AdminUserItem>> {
  return postJson(`/admin/users/${encodeURIComponent(userId)}/unlock-role`, {});
}

// --- AD sync + group→role mappings (006-ad-auth) ---

export type ADSyncResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  dry_run: boolean;
};

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

export type ADGroupItem = { cn: string; description: string };

export async function runAdSync(body?: {
  base_dn?: string;
  filter?: string;
  dry_run?: boolean;
}): Promise<RcResponse<ADSyncResult>> {
  return postJson("/ad-auth/admin/ad/sync", body ?? {});
}

export async function listAdGroups(): Promise<RcResponse<{ items: ADGroupItem[] }>> {
  return getJson("/ad-auth/admin/ad/groups");
}

export async function listAdRoleMappings(): Promise<
  RcResponse<{ items: ADRoleMappingItem[]; all_menus: MenuKeyItem[] }>
> {
  return getJson("/admin/users/ad-role-mappings");
}

export async function upsertAdRoleMapping(body: {
  ad_group: string;
  role_key: string;
  priority: number;
}): Promise<RcResponse<ADRoleMappingItem>> {
  return postJson("/admin/users/ad-role-mappings", body);
}

export async function deleteAdRoleMapping(adGroup: string): Promise<RcResponse<unknown>> {
  return deleteJson(`/admin/users/ad-role-mappings/${encodeURIComponent(adGroup)}`);
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<RcResponse<unknown>> {
  return postJson("/account/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function uploadReleasePackage(file: File): Promise<
  RcResponse<{
    download_url: string;
    file_name: string;
    file_size_bytes: number;
    md5: string;
    sha256: string;
    storage_path: string;
  }>
> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${apiPrefix()}/admin/releases/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { rc: 1, message: res.ok ? "响应解析失败" : `上传失败（HTTP ${res.status}）` };
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.rc === "number") {
    return payload as any;
  }
  return { rc: 1, message: typeof obj.detail === "string" ? obj.detail : `上传失败（HTTP ${res.status}）` };
}

// --- Roles CRUD ---

export type MenuKeyItem = { key: string; label: string };

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

