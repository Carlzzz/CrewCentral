/** JSON `rc` envelope helpers; requests use same-origin + credentials (Vite proxy → FastAPI). */

export type RcResponse<T = unknown> = {
  rc: number;
  message: string;
  data?: T;
};

export const apiPrefix = () => `${import.meta.env.BASE_URL}api/v1`;

export async function getJson<T>(path: string): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, { credentials: "include" });
  return (await res.json()) as RcResponse<T>;
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
  return (await res.json()) as RcResponse<T>;
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
  return (await res.json()) as RcResponse<T>;
}

export async function deleteJson<T>(path: string, init?: RequestInit): Promise<RcResponse<T>> {
  const res = await fetch(`${apiPrefix()}${path}`, {
    method: "DELETE",
    credentials: "include",
    ...init,
  });
  return (await res.json()) as RcResponse<T>;
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
  email: string;
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
