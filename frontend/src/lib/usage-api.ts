import { getJson, type RcResponse } from "./api";

export type ModelBucket = {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type UserBucket = {
  username: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type UsageOverview = {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  by_model: ModelBucket[];
  by_user: UserBucket[];
};

export type DayBucket = {
  date: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type UsageRecord = {
  clientid: string;
  username: string;
  modelid: string;
  input_token: number;
  output_token: number;
  input_cached_token: number;
  start_time: string;
  out_time: string;
  cost_time: string;
  stream: boolean | null;
  session_id: string | null;
  routing_key: string | null;
  input_content: string | null;
  output_content: string | null;
};

export type UsageRecordsPage = {
  items: UsageRecord[];
  total: number;
  page: number;
  page_size: number;
};

function qs(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function fetchUsageOverview(opts: {
  username?: string;
  gte?: string;
  lte?: string;
}): Promise<RcResponse<UsageOverview>> {
  return getJson(`/admin/usage/overview${qs(opts)}`);
}

export function fetchUsageTrend(opts: {
  username?: string;
  gte?: string;
  lte?: string;
  days?: number;
}): Promise<RcResponse<DayBucket[]>> {
  return getJson(`/admin/usage/trend${qs(opts)}`);
}

export function fetchUsageRecords(opts: {
  username?: string;
  modelid?: string;
  session_id?: string;
  gte?: string;
  lte?: string;
  page?: number;
  page_size?: number;
}): Promise<RcResponse<UsageRecordsPage>> {
  return getJson(`/admin/usage/records${qs(opts)}`);
}

export type FilterOptions = {
  users: string[];
  models: string[];
};

export function fetchFilterOptions(): Promise<RcResponse<FilterOptions>> {
  return getJson("/admin/usage/filters");
}
