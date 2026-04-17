import { getJson, postJson, type RcResponse } from "./api";

export type DeviceStats = {
  total: number;
  online: number;
  offline: number;
  anomaly: number;
};

export type DeviceRow = {
  id: string;
  device_uuid: string;
  name: string | null;
  owner_user_id: string;
  owner_display_name: string | null;
  owner_email: string | null;
  os_version: string | null;
  client_version: string | null;
  last_ip: string | null;
  last_ip_geo: string | null;
  mac_address: string | null;
  current_skill_slug: string | null;
  status: string;
  last_seen_at: string | null;
  hardware_snapshot: Record<string, unknown> | null;
};

export async function fetchDeviceStats(): Promise<RcResponse<DeviceStats>> {
  return getJson<DeviceStats>("/admin/devices/stats");
}

export async function fetchDeviceList(params: {
  status?: string;
  user_id?: string;
  ip?: string;
  page?: number;
  page_size?: number;
}): Promise<RcResponse<{ items: DeviceRow[]; total: number; page: number; page_size: number; pages: number }>> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.user_id) q.set("user_id", params.user_id);
  if (params.ip) q.set("ip", params.ip);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 20));
  return getJson(`/admin/devices?${q.toString()}`);
}

export async function kickDevice(deviceId: string): Promise<RcResponse<unknown>> {
  return postJson(`/admin/devices/${encodeURIComponent(deviceId)}/kick`, {});
}

export async function blockDevice(deviceId: string): Promise<RcResponse<unknown>> {
  return postJson(`/admin/devices/${encodeURIComponent(deviceId)}/block`, {});
}

export async function unblockDevice(deviceId: string): Promise<RcResponse<unknown>> {
  return postJson(`/admin/devices/${encodeURIComponent(deviceId)}/unblock`, {});
}

export async function rebootDevice(deviceId: string): Promise<RcResponse<{ command_id: string }>> {
  return postJson(`/admin/devices/${encodeURIComponent(deviceId)}/reboot`, {});
}

export async function fetchDeviceLogs(
  deviceId: string,
  limit = 50,
): Promise<RcResponse<{ id: string; level: string; message: string; created_at: string }[]>> {
  return getJson(`/admin/devices/${encodeURIComponent(deviceId)}/logs?limit=${limit}`);
}
