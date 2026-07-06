import { getJson, postJson, type RcResponse } from "./api";

export type AvailableModelItem = {
  model_id: string;
  model_alias: string;
};

export type RoleModelPermissionItem = {
  role: string;
  label: string;
  is_system: boolean;
  allowed_models: string[] | null;
};

export async function listAvailableModels(): Promise<RcResponse<{ items: AvailableModelItem[] }>> {
  return getJson<{ items: AvailableModelItem[] }>("/admin/models/available");
}

export async function listRoleModelPermissions(): Promise<RcResponse<{ items: RoleModelPermissionItem[] }>> {
  return getJson<{ items: RoleModelPermissionItem[] }>("/admin/models/roles");
}

export async function setRoleModelPermissions(
  role: string,
  allowedModels: string[] | null,
): Promise<RcResponse<unknown>> {
  return postJson(`/admin/models/roles/${encodeURIComponent(role)}`, {
    allowed_models: allowedModels,
  });
}
