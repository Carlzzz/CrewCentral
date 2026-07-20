import { getJson, type RcResponse } from "./api";
import type { DayBucket, ModelBucket } from "./usage-api";

export type { DayBucket } from "./usage-api";

/** 个人用量概览：与 admin 版一致，但不含 by_user（页面恒为本人）。 */
export type MyUsageOverview = {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  by_model: ModelBucket[];
};

export type MyFilterOptions = {
  models: string[];
};

function qs(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** 个人用量接口：服务端按当前登录用户强制过滤，无需也拒绝传 username。 */
export function fetchMyUsageOverview(opts: {
  modelid?: string;
  gte?: string;
  lte?: string;
}): Promise<RcResponse<MyUsageOverview>> {
  return getJson(`/account/usage/overview${qs(opts)}`);
}

export function fetchMyUsageTrend(opts: {
  modelid?: string;
  gte?: string;
  lte?: string;
  days?: number;
}): Promise<RcResponse<DayBucket[]>> {
  return getJson(`/account/usage/trend${qs(opts)}`);
}

export function fetchMyUsageFilters(): Promise<RcResponse<MyFilterOptions>> {
  return getJson("/account/usage/filters");
}
