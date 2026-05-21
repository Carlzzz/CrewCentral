/**
 * Download center API — paths under `{BASE_PATH}/api/v1` (see constitution Base Path).
 * Public endpoints use same-origin fetch without credentials; admin uses cookies.
 */

import { apiPrefix, deleteJson, getJson, postJson, type RcResponse } from "./api";

export type Platform = "windows" | "macos" | "linux";

export type ChangelogEntry = { type: "new" | "fix"; text: string };

export type AssetPublic = {
  platform: Platform;
  download_url: string;
  file_name: string;
  file_size_bytes: number | null;
  md5: string;
  sha256: string;
};

export type DownloadContextData = {
  version: string;
  published_at: string | null;
  slogan: string;
  logo_url: string;
  recommended_platform: Platform | null;
  primary_asset: AssetPublic | null;
  all_assets: AssetPublic[];
  release_notes_excerpt: string;
  changelog_entries: ChangelogEntry[];
};

export type LatestReleaseData = {
  is_latest: boolean;
  current_version: string | null;
  target_version: string | null;
  update_policy: "optional" | "forced" | null;
  assets: AssetPublic[];
  release_notes_excerpt: string | null;
};

async function getJsonPublic<T>(path: string): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, { credentials: "omit" });
  return (await res.json()) as RcResponse<T>;
}

export async function getDownloadContext(): Promise<RcResponse<DownloadContextData>> {
  return getJsonPublic<DownloadContextData>("/public/releases/download-context");
}

export async function getLatestRelease(
  currentVersion?: string,
): Promise<RcResponse<LatestReleaseData>> {
  const q =
    currentVersion !== undefined && currentVersion !== ""
      ? `?current_version=${encodeURIComponent(currentVersion)}`
      : "";
  return getJsonPublic<LatestReleaseData>(`/releases/latest${q}`);
}

export type ReleaseAssetIn = {
  platform: Platform;
  download_url: string;
  file_name: string;
  md5: string;
  sha256: string;
  file_size_bytes?: number | null;
};

export type ClientReleaseAdmin = {
  id: string;
  version: string;
  release_notes: string;
  changelog_entries: ChangelogEntry[];
  update_policy: "optional" | "forced";
  status: "draft" | "published" | "archived";
  published_at: string | null;
  logo_url: string | null;
  slogan: string | null;
  enabled_platforms: Platform[];
  assets: ReleaseAssetIn[];
  created_at: string;
  updated_at: string;
};

export async function listAdminReleases(): Promise<RcResponse<{ items: ClientReleaseAdmin[] }>> {
  return getJson("/admin/releases");
}

export async function getAdminRelease(id: string): Promise<RcResponse<ClientReleaseAdmin>> {
  return getJson(`/admin/releases/${encodeURIComponent(id)}`);
}

export async function createAdminRelease(
  body: Record<string, unknown>,
): Promise<RcResponse<ClientReleaseAdmin>> {
  return postJson("/admin/releases", body);
}

export async function patchAdminRelease(
  id: string,
  body: Record<string, unknown>,
): Promise<RcResponse<ClientReleaseAdmin>> {
  const res = await fetch(`${apiPrefix()}/admin/releases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return (await res.json()) as RcResponse<ClientReleaseAdmin>;
}

export async function publishAdminRelease(id: string): Promise<RcResponse<ClientReleaseAdmin>> {
  return postJson(`/admin/releases/${encodeURIComponent(id)}/publish`, {});
}

export async function archiveAdminRelease(id: string): Promise<RcResponse<ClientReleaseAdmin>> {
  return postJson(`/admin/releases/${encodeURIComponent(id)}/archive`, {});
}

export async function deleteAdminRelease(id: string): Promise<RcResponse<unknown>> {
  return deleteJson(`/admin/releases/${encodeURIComponent(id)}`);
}
