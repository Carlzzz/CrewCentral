/** JSON `rc` envelope helpers; requests use same-origin + credentials (Vite proxy → FastAPI). */

export type RcResponse<T = unknown> = {
  rc: number;
  message: string;
  data?: T;
};

export const apiPrefix = () => `${import.meta.env.BASE_URL}api/v1`;

function normalizeResponse<T>(raw: Record<string, unknown>, status: number): RcResponse<T> {
  if (typeof raw.rc === "number") return raw as unknown as RcResponse<T>;
  if (raw.detail) {
    const detail = raw.detail;
    if (typeof detail === "string") return { rc: 1, message: detail };
    if (Array.isArray(detail)) {
      const msg = detail.map((d: { msg?: string; loc?: string[] }) =>
        d.msg ? `${(d.loc ?? []).slice(-1).join(".")}: ${d.msg}` : JSON.stringify(d),
      ).join("; ");
      return { rc: 1, message: msg };
    }
  }
  return { rc: status >= 400 ? 1 : 0, message: status >= 400 ? `请求失败（HTTP ${status}）` : "" };
}

export async function getJson<T>(path: string): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  return normalizeResponse<T>(await res.json(), res.status);
}

export async function postJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
    body: JSON.stringify(body),
    ...init,
  });
  return normalizeResponse<T>(await res.json(), res.status);
}

export async function patchJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
    body: JSON.stringify(body),
    ...init,
  });
  return normalizeResponse<T>(await res.json(), res.status);
}

export async function deleteJson<T>(path: string, init?: RequestInit): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, {
    method: "DELETE",
    credentials: "include",
    ...init,
  });
  return normalizeResponse<T>(await res.json(), res.status);
}

export async function fetchConsentContext(state: string): Promise<RcResponse<{
  client_label: string;
  device_label: string;
}> | null> {
  const res = await fetch(
    `${apiPrefix()}/auth/consent/context?state=${encodeURIComponent(state)}`,
    { credentials: "include" },
  );
  if (res.status === 401) return null;
  return res.json();
}

export async function fetchSessionUserinfo(): Promise<{
  user_id: string;
  email: string | null;
  username?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role?: string;
  menu_permissions?: string[];
} | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}auth/userinfo`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  return res.json();
}
