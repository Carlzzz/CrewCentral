import { apiPrefix, type RcResponse } from "./api";

export type SkillListItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  summary: string | null;
  icon_url: string | null;
  status: string;
  latest_version: string | null;
  /** 已开启分发：客户端 manifest / 下载 / 公开 index 仅包含此类技能 */
  distribution_enabled?: boolean;
};

export type SkillVersionItem = {
  id: string;
  version: string;
  description: string | null;
  changelog: string | null;
  platforms: string[];
  package_hash: string;
  published_at: string;
};

export async function fetchSkills(params: {
  category?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}): Promise<RcResponse<{ items: SkillListItem[]; total: number; page: number; page_size: number }>> {
  const q = new URLSearchParams();
  if (params.category && params.category !== "全部") q.set("category", params.category);
  if (params.keyword) q.set("keyword", params.keyword);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 20));
  const res = await fetch(`${apiPrefix()}/admin/skills?${q.toString()}`, {
    credentials: "include",
  });
  return (await res.json()) as RcResponse<{ items: SkillListItem[]; total: number; page: number; page_size: number }>;
}

export async function uploadSkillPackage(file: File): Promise<RcResponse<unknown>> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return { rc: 1, message: "仅支持 .zip 技能包" };
  }
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${apiPrefix()}/admin/skills/upload`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { rc: 1, message: res.ok ? "响应解析失败" : `上传失败（HTTP ${res.status}）` };
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.rc === "number") {
    return {
      rc: obj.rc,
      message: typeof obj.message === "string" ? obj.message : "",
      data: obj.data,
    } as RcResponse<unknown>;
  }
  const detail = obj.detail;
  let msg = `上传失败（HTTP ${res.status}）`;
  if (typeof detail === "string") {
    msg = detail;
  } else if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === "string") msg = first.msg;
  }
  return { rc: 1, message: msg };
}

export async function fetchSkillVersions(skillId: string): Promise<RcResponse<SkillVersionItem[]>> {
  const res = await fetch(`${apiPrefix()}/admin/skills/${encodeURIComponent(skillId)}/versions`, {
    credentials: "include",
  });
  return (await res.json()) as RcResponse<SkillVersionItem[]>;
}

export async function toggleDispatch(skillId: string, payload: {
  enabled: boolean;
  scope: "all_devices" | "group_only";
  group_id?: string;
}): Promise<RcResponse<unknown>> {
  const res = await fetch(`${apiPrefix()}/admin/skills/${encodeURIComponent(skillId)}/toggle-dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  return (await res.json()) as RcResponse<unknown>;
}

export async function saveAssignments(payload: {
  target_type: "user" | "group";
  target_id: string;
  skills: { skill_id: string; enabled: boolean; config: Record<string, unknown> }[];
}): Promise<RcResponse<unknown>> {
  const res = await fetch(`${apiPrefix()}/admin/skills/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  return (await res.json()) as RcResponse<unknown>;
}

export async function fetchManifest(params: {
  device_uuid: string;
  platform: string;
  accessToken: string;
}): Promise<RcResponse<{ items: unknown[] }>> {
  const q = new URLSearchParams({
    device_uuid: params.device_uuid,
    platform: params.platform,
  });
  const res = await fetch(`${apiPrefix()}/skills/manifest?${q.toString()}`, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  return (await res.json()) as RcResponse<{ items: unknown[] }>;
}

export async function deleteSkill(skillId: string): Promise<RcResponse<unknown>> {
  const res = await fetch(`${apiPrefix()}/admin/skills/${encodeURIComponent(skillId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return (await res.json()) as RcResponse<unknown>;
}
