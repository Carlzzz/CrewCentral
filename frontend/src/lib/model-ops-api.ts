/**
 * CrewProxy provider config API client.
 *
 * Wraps the four Task 8 admin routes:
 *   GET    /admin/model-ops/providers/config     — redacted persisted config
 *   POST   /admin/model-ops/providers/validate   — dry-run validation
 *   PUT    /admin/model-ops/providers/config     — persist (apiKeyMode: keep|replace)
 *   GET    /admin/model-ops/providers/effective  — CrewProxy live state
 *
 * The server NEVER returns a full apiKey. Persisted upstreams/credentials
 * surface only `hasApiKey` + `apiKeyMasked`. Saving in "keep" mode sends no
 * key; "replace" mode sends the user-entered key.
 */

import { getJson, postJson, apiPrefix, type RcResponse } from "./api";

export type ApiKeyMode = "keep" | "replace";

/* ------------------------------------------------------------------ */
/*  View types (server → client, always redacted)                      */
/* ------------------------------------------------------------------ */

export type CredentialView = {
  id: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  model?: string;
  weight: number;
  enabled: boolean;
};

export type UpstreamView = {
  baseURL: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  model: string;
  provider?: string;
  codePlanCredentials?: CredentialView[];
  quotaLimits?: { fiveHourTokens?: number; weeklyTokens?: number };
};

export type ModelRouteView = { upstream: string; model?: string };

export type ProviderConfigView = {
  configPath?: string;
  defaultUpstream?: UpstreamView;
  upstreamsById?: Record<string, UpstreamView>;
  modelRoutes?: Record<string, ModelRouteView | string>;
  updatedAt?: number;
};

/* ------------------------------------------------------------------ */
/*  Draft types (client → server)                                      */
/* ------------------------------------------------------------------ */

export type CredentialDraft = {
  id: string;
  apiKeyMode: ApiKeyMode;
  apiKey?: string;
  weight: number;
  enabled: boolean;
};

export type UpstreamDraft = {
  baseURL: string;
  apiKeyMode: ApiKeyMode;
  apiKey?: string;
  model: string;
  provider?: string;
  codePlanCredentials?: CredentialDraft[];
  quotaLimits?: { fiveHourTokens?: number; weeklyTokens?: number };
};

export type ProviderConfigDraft = {
  defaultUpstream?: UpstreamDraft;
  upstreamsById?: Record<string, UpstreamDraft>;
  modelRoutes?: Record<string, ModelRouteView | string>;
};

export type ValidationIssue = { path: string; message: string };

export type ValidationResult = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type EffectiveUpstream = {
  upstreamId: string;
  provider: string;
  model: string;
  baseURL: string;
  credentialCount: number;
  enabledCredentialCount: number;
};

export type EffectiveModel = {
  model: string;
  upstream: string;
  upstreamModel: string | null;
};

export type EffectiveConfig = {
  defaultUpstream?: string | null;
  upstreams: EffectiveUpstream[];
  models: EffectiveModel[];
  loadedAt?: number;
};

export type SaveResult = {
  ok: boolean;
  savedAt?: number;
  configPath?: string;
};

/* ------------------------------------------------------------------ */
/*  Client functions                                                   */
/* ------------------------------------------------------------------ */

export function fetchProviderConfig(): Promise<RcResponse<ProviderConfigView>> {
  return getJson<ProviderConfigView>("/admin/model-ops/providers/config");
}

export function validateProviderConfig(
  draft: ProviderConfigDraft,
): Promise<RcResponse<ValidationResult>> {
  return postJson<ValidationResult>(
    "/admin/model-ops/providers/validate",
    draft,
  );
}

/**
 * PUT is not exported from api.ts; issue a same-origin credentialed fetch
 * against the same prefix used by getJson/postJson to keep the rc envelope
 * consistent.
 */
export async function saveProviderConfig(
  draft: ProviderConfigDraft,
): Promise<RcResponse<SaveResult>> {
  const res = await fetch(`${apiPrefix()}/admin/model-ops/providers/config`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return normalizeSaveResponse(await res.json(), res.status);
}

function normalizeSaveResponse(raw: Record<string, unknown>, status: number): RcResponse<SaveResult> {
  if (typeof raw.rc === "number") return raw as unknown as RcResponse<SaveResult>;
  if (raw.detail) {
    const detail = raw.detail;
    if (typeof detail === "string") return { rc: 1, message: detail };
    if (Array.isArray(detail)) {
      const msg = detail
        .map((d: { msg?: string; loc?: string[] }) =>
          d.msg ? `${(d.loc ?? []).slice(-1).join(".")}: ${d.msg}` : JSON.stringify(d),
        )
        .join("; ");
      return { rc: 1, message: msg };
    }
  }
  return {
    rc: status >= 400 ? 1 : 0,
    message: status >= 400 ? `请求失败（HTTP ${status}）` : "",
  };
}

export function fetchProviderEffectiveConfig(): Promise<RcResponse<EffectiveConfig>> {
  return getJson<EffectiveConfig>("/admin/model-ops/providers/effective");
}
