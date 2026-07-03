/** AD login API wrappers (006-ad-auth). Reuses the shared rc envelope + cookie session. */

import { getJson, postJson, RcResponse } from "./api";

export async function fetchAdEnabled(): Promise<boolean> {
  const res = await getJson<{ enabled: boolean }>("/ad-auth/enabled");
  return res.rc === 0 && Boolean(res.data?.enabled);
}

export async function adLogin(
  account: string,
  password: string,
  state?: string,
): Promise<RcResponse<{ redirect: string }>> {
  return postJson<{ redirect: string }>("/ad-auth/login", {
    account,
    password,
    ...(state ? { state } : {}),
  });
}
