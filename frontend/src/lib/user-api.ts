import { apiPrefix, deleteJson, getJson, patchJson, postJson, type RcResponse } from "./api";

export type AdminUserItem = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role: string;
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

// --- Role menu permissions ---

export type MenuKeyItem = { key: string; label: string };

export type RoleMenuPermItem = {
  role: string;
  menu_keys: string[];
  is_default: boolean;
};

export async function listRoleMenuPermissions(): Promise<
  RcResponse<{ items: RoleMenuPermItem[]; all_menus: MenuKeyItem[] }>
> {
  return getJson("/admin/users/roles/menu-permissions");
}

export async function setRoleMenuPermissions(
  role: string,
  menuKeys: string[],
): Promise<RcResponse<unknown>> {
  return postJson(`/admin/users/roles/${encodeURIComponent(role)}/menu-permissions`, {
    menu_keys: menuKeys,
  });
}

