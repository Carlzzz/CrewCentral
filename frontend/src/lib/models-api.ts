import { getJson, postJson, type RcResponse } from "./api";

export type AvailableModelItem = {
  model_id: string;
  model_alias: string;
};

export type UserModelPermissionItem = {
  id: string;
  email: string;
  display_name: string | null;
  allowed_models: string[] | null;
};

export async function listAvailableModels(): Promise<RcResponse<{ items: AvailableModelItem[] }>> {
  const res = await getJson<{ items: AvailableModelItem[] }>("/admin/models/available");
  // The backend might return { rc: 0, data: { items: [...] } } or { rc: 0, data: { items: [...] } }
  // Since normalizeResponse normalizes the JSON envelope, let's look at the shape:
  // If the backend returns rc_ok(resp.json()), the normalized response will contain `data` which has `items` (from CrewProxy).
  // Wait, let's verify models_admin.py:
  // `return rc_ok(resp.json())` -> this wraps the proxy response in rc_ok, so `data` will be the proxy response itself.
  // The proxy response is `{ items: [...] }`.
  // So the FastAPI response is `{"rc": 0, "message": "...", "data": { "items": [...] }}`.
  // Therefore, normalizeResponse returns `RcResponse<{ items: AvailableModelItem[] }>` where `data` is `{ items: [...] }`.
  // That matches perfectly!
  return res;
}

export async function listUserModelPermissions(): Promise<RcResponse<{ items: UserModelPermissionItem[] }>> {
  return getJson<{ items: UserModelPermissionItem[] }>("/admin/models/users");
}

export async function setUserModelPermissions(
  userId: string,
  allowedModels: string[] | null,
): Promise<RcResponse<unknown>> {
  // We use postJson or putJson?
  // Wait, we implemented PUT in backend, but our api.ts doesn't export putJson.
  // Ah! Let's check api.ts again: it exports getJson, postJson, patchJson, deleteJson. It does NOT export putJson!
  // Wait, can we change backend to POST, or write a custom putJson, or add putJson to api.ts, or make backend use POST?
  // Changing backend to use POST /api/v1/admin/models/users/{user_id} is extremely easy and avoids adding a new helper!
  // Or we can call fetch directly, or add putJson to api.ts.
  // Wait, let's see which is easier: changing the backend endpoint to POST or patching api.ts.
  // Let's change the backend route to `@router.post("/users/{user_id}")`!
  // Wait! Let's check models_admin.py again:
  // `@router.put("/users/{user_id}")`
  // We can easily change it to `@router.post("/users/{user_id}")` since we are the author. Let's do that!
  // Let's first write models-api.ts to use postJson.
  return postJson(`/admin/models/users/${encodeURIComponent(userId)}`, {
    allowed_models: allowedModels,
  });
}
