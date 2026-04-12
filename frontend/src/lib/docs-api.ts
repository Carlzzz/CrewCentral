/**
 * Docs API — `{BASE_PATH}/api/v1/public/docs/*` (anonymous) & `/admin/docs/*` (session).
 */

import { apiPrefix, deleteJson, getJson, patchJson, postJson, type RcResponse } from "./api";

export type NavSection = "getting_started" | "device" | "skill_dev" | "api_ref";

export type DocTreeNode = {
  id: string;
  slug: string;
  title: string;
  nav_section: NavSection;
  children: DocTreeNode[];
};

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  getting_started: "快速入门",
  device: "设备接入",
  skill_dev: "技能开发",
  api_ref: "API 参考",
};

export async function getDocTree(navSection?: NavSection): Promise<RcResponse<{ roots: DocTreeNode[] }>> {
  const q = navSection ? `?nav_section=${encodeURIComponent(navSection)}` : "";
  return getJsonPublic<{ roots: DocTreeNode[] }>(`/public/docs/tree${q}`);
}

export type DocPagePayload = {
  slug: string;
  title: string;
  body_md: string;
  nav_section: NavSection;
};

export async function getDocPageBySlug(slug: string): Promise<RcResponse<DocPagePayload>> {
  return getJsonPublic<DocPagePayload>(`/public/docs/pages/${encodeURIComponent(slug)}`);
}

export type SearchHit = { slug: string; title: string; snippet: string | null };

export async function searchDocs(q: string, limit = 20): Promise<RcResponse<{ items: SearchHit[] }>> {
  return getJsonPublic<{ items: SearchHit[] }>(
    `/public/docs/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
}

async function getJsonPublic<T>(path: string): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, { credentials: "omit" });
  return (await res.json()) as RcResponse<T>;
}

export type DocPageAdmin = {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  nav_section: NavSection;
  parent_id: string | null;
  sort_order: number;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string | null;
};

export async function getAdminDocTree(): Promise<RcResponse<{ roots: DocTreeNode[] }>> {
  return getJson("/admin/docs/tree");
}

export async function listAdminPages(): Promise<RcResponse<{ items: DocPageAdmin[] }>> {
  return getJson("/admin/docs/pages");
}

export async function getAdminPage(id: string): Promise<RcResponse<DocPageAdmin>> {
  return getJson(`/admin/docs/pages/${encodeURIComponent(id)}`);
}

export async function createAdminPage(body: Record<string, unknown>): Promise<RcResponse<DocPageAdmin>> {
  return postJson("/admin/docs/pages", body);
}

export async function patchAdminPage(
  id: string,
  body: Record<string, unknown>,
): Promise<RcResponse<DocPageAdmin>> {
  return patchJson(`/admin/docs/pages/${encodeURIComponent(id)}`, body);
}

export async function deleteAdminPage(id: string): Promise<RcResponse<unknown>> {
  return deleteJson(`/admin/docs/pages/${encodeURIComponent(id)}`);
}

export async function publishAdminPage(id: string): Promise<RcResponse<DocPageAdmin>> {
  return postJson(`/admin/docs/pages/${encodeURIComponent(id)}/publish`, {});
}
