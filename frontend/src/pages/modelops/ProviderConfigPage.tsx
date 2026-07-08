/**
 * CrewProxy Provider configuration page.
 *
 * Loads the redacted persisted config, lets the operator edit upstream
 * providers + model routes, then validates and saves. After save, polls the
 * effective endpoint at 300/800/1500ms to detect the new upstream/models.
 *
 * Security invariants:
 *   - Full apiKeys are NEVER displayed. Loaded state shows `apiKeyMasked`
 *     with the field in `keep` mode. The user must explicitly switch to
 *     `replace` (替换) to enter a new key.
 *   - `keep` mode sends no key value to the server.
 *   - Duplicating a provider clears all keys to `replace` mode with empty
 *     values so the operator must re-enter them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchProviderConfig,
  fetchProviderEffectiveConfig,
  saveProviderConfig,
  validateProviderConfig,
  type ApiKeyMode,
  type CredentialDraft,
  type CredentialView,
  type EffectiveConfig,
  type ProviderConfigDraft,
  type ProviderConfigView,
  type UpstreamDraft,
  type UpstreamView,
  type ValidationIssue,
  type ModelRouteView,
} from "../../lib/model-ops-api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PROVIDERS = [
  "glm",
  "minimax",
  "openai",
  "deepseek",
  "claude",
  "gemini",
  "ark",
  "custom",
] as const;
type ProviderName = (typeof PROVIDERS)[number];

const UPSTREAM_ID_RE = /^[a-zA-Z0-9_-]+$/;

const EFFECTIVE_POLL_MS = [300, 800, 1500];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyUpstreamDraft(): UpstreamDraft {
  return {
    baseURL: "",
    apiKeyMode: "keep",
    apiKey: "",
    model: "",
    provider: "custom",
    codePlanCredentials: [],
    quotaLimits: { fiveHourTokens: undefined },
  };
}

function viewToDraft(v: UpstreamView): UpstreamDraft {
  return {
    baseURL: v.baseURL ?? "",
    apiKeyMode: "keep",
    apiKey: "",
    model: v.model ?? "",
    provider: v.provider ?? "custom",
    codePlanCredentials: (v.codePlanCredentials ?? []).map(viewCredToDraft),
    quotaLimits: v.quotaLimits
      ? { fiveHourTokens: v.quotaLimits.fiveHourTokens, weeklyTokens: v.quotaLimits.weeklyTokens }
      : { fiveHourTokens: undefined },
  };
}

function viewCredToDraft(c: CredentialView): CredentialDraft {
  return {
    id: c.id,
    apiKeyMode: "keep",
    apiKey: "",
    weight: c.weight ?? 1,
    enabled: c.enabled ?? true,
    // View-only: carried in state so keep mode can render the masked preview.
    // Never sent to the server — buildDraft drops these when reconstructing.
    hasApiKey: !!c.hasApiKey,
    apiKeyMasked: c.apiKeyMasked ?? "",
  };
}

function duplicateUpstreamDraft(src: UpstreamDraft): UpstreamDraft {
  // Force re-entry of every key: every credential and the upstream key drop
  // to replace mode with empty values.
  return {
    ...src,
    apiKeyMode: "replace",
    apiKey: "",
    codePlanCredentials: (src.codePlanCredentials ?? []).map((c) => ({
      ...c,
      apiKeyMode: "replace" as ApiKeyMode,
      apiKey: "",
      // Duplicate starts with no persisted key on the new copy: drop any
      // inherited masking so the row shows "未配置" until re-entered.
      hasApiKey: false,
      apiKeyMasked: "",
    })),
  };
}

function hostOf(url: string): string {
  if (!url) return "—";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.host || url;
  } catch {
    return url;
  }
}

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function normalizeModelRoute(value: ModelRouteView | string): ModelRouteView {
  if (typeof value === "string") return { upstream: value };
  return { upstream: value.upstream, model: value.model };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type UpstreamState = {
  draft: UpstreamDraft;
  hasApiKey: boolean;
  apiKeyMasked: string;
};

type Banner = { kind: "ok" | "warn" | "err"; text: string } | null;

export default function ProviderConfigPage() {
  const [loading, setLoading] = useState(true);
  const [configPath, setConfigPath] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // upstreamsById keyed by upstreamId. Insertion order preserved.
  const [upstreams, setUpstreams] = useState<Record<string, UpstreamState>>({});
  const [order, setOrder] = useState<string[]>([]);

  // modelRoutes keyed by model name.
  const [routes, setRoutes] = useState<Record<string, ModelRouteView>>({});

  // defaultUpstream round-trips the persisted default so saves don't drop it.
  // Rendered read-only; editors live on the named upstreams above.
  const [defaultUpstream, setDefaultUpstream] = useState<UpstreamState | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [effective, setEffective] = useState<EffectiveConfig | null>(null);
  const [proxyOnline, setProxyOnline] = useState<boolean | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  /* ---------- initial load ---------- */

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [cfgRes, effRes] = await Promise.all([
      fetchProviderConfig(),
      fetchProviderEffectiveConfig(),
    ]);
    if (cfgRes.rc !== 0) {
      setBanner({ kind: "err", text: `加载配置失败：${cfgRes.message || "未知错误"}` });
      setLoading(false);
      return;
    }
    const data: ProviderConfigView = cfgRes.data ?? {};
    setConfigPath(data.configPath ?? "");
    setUpdatedAt(typeof data.updatedAt === "number" ? data.updatedAt : null);

    const next: Record<string, UpstreamState> = {};
    const nextOrder: string[] = [];
    for (const [id, v] of Object.entries(data.upstreamsById ?? {})) {
      next[id] = {
        draft: viewToDraft(v),
        hasApiKey: !!v.hasApiKey,
        apiKeyMasked: v.apiKeyMasked ?? "",
      };
      nextOrder.push(id);
    }
    setUpstreams(next);
    setOrder(nextOrder);

    const nextRoutes: Record<string, ModelRouteView> = {};
    for (const [model, value] of Object.entries(data.modelRoutes ?? {})) {
      nextRoutes[model] = normalizeModelRoute(value);
    }
    setRoutes(nextRoutes);

    // Round-trip defaultUpstream: preserve any persisted default so the next
    // save does not silently drop it. Kept in keep mode with masked preview.
    if (data.defaultUpstream) {
      setDefaultUpstream({
        draft: viewToDraft(data.defaultUpstream),
        hasApiKey: !!data.defaultUpstream.hasApiKey,
        apiKeyMasked: data.defaultUpstream.apiKeyMasked ?? "",
      });
    } else {
      setDefaultUpstream(null);
    }

    if (effRes.rc === 0) {
      setEffective(effRes.data ?? null);
      setProxyOnline(true);
    } else {
      setProxyOnline(false);
    }
    if (nextOrder.length > 0) setSelectedId((cur) => cur ?? nextOrder[0]);
    setLoading(false);
    setBanner(null);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /* ---------- derived: effective detection helpers ---------- */

  const effectiveUpstreamIds = useMemo(
    () => new Set((effective?.upstreams ?? []).map((u) => u.upstreamId)),
    [effective],
  );
  const effectiveModels = useMemo(
    () => new Set((effective?.models ?? []).map((m) => m.model)),
    [effective],
  );

  /* ---------- upstream list ops ---------- */

  const addUpstream = useCallback(() => {
    let base = "new-upstream";
    let n = 1;
    while (upstreams[base]) base = `new-upstream-${++n}`;
    setUpstreams((prev) => ({ ...prev, [base]: { draft: emptyUpstreamDraft(), hasApiKey: false, apiKeyMasked: "" } }));
    setOrder((prev) => [...prev, base]);
    setSelectedId(base);
  }, [upstreams]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId || !upstreams[selectedId]) return;
    const src = upstreams[selectedId];
    let base = `${selectedId}-copy`;
    let n = 1;
    while (upstreams[base]) base = `${selectedId}-copy-${++n}`;
    setUpstreams((prev) => ({ ...prev, [base]: { draft: duplicateUpstreamDraft(src.draft), hasApiKey: false, apiKeyMasked: "" } }));
    setOrder((prev) => [...prev, base]);
    setSelectedId(base);
  }, [selectedId, upstreams]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const id = selectedId;
    setUpstreams((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      const next = prev.filter((x) => x !== id);
      setSelectedId(next[idx] ?? next[idx - 1] ?? next[0] ?? null);
      return next;
    });
    // remove any routes pointing at the deleted upstream
    setRoutes((prev) => {
      const next: Record<string, ModelRouteView> = {};
      for (const [m, r] of Object.entries(prev)) {
        if (r.upstream === id) continue;
        next[m] = r;
      }
      return next;
    });
  }, [selectedId]);

  /* ---------- upstream field editing ---------- */

  const patchDraft = useCallback(
    (id: string, patch: Partial<UpstreamDraft>) => {
      setUpstreams((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, draft: { ...cur.draft, ...patch } } };
      });
    },
    [],
  );

  const switchApiKeyMode = useCallback(
    (id: string, mode: ApiKeyMode) => {
      patchDraft(id, { apiKeyMode: mode, apiKey: mode === "replace" ? "" : "" });
    },
    [patchDraft],
  );

  /* ---------- credentials ---------- */

  const addCredential = useCallback(
    (id: string) => {
      setUpstreams((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        const creds = [...(cur.draft.codePlanCredentials ?? [])];
        creds.push({ id: "", apiKeyMode: "replace", apiKey: "", weight: 1, enabled: true, hasApiKey: false, apiKeyMasked: "" });
        return { ...prev, [id]: { ...cur, draft: { ...cur.draft, codePlanCredentials: creds } } };
      });
    },
    [],
  );

  const patchCredential = useCallback(
    (id: string, idx: number, patch: Partial<CredentialDraft>) => {
      setUpstreams((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        const creds = [...(cur.draft.codePlanCredentials ?? [])];
        const target = creds[idx];
        if (!target) return prev;
        creds[idx] = { ...target, ...patch };
        return { ...prev, [id]: { ...cur, draft: { ...cur.draft, codePlanCredentials: creds } } };
      });
    },
    [],
  );

  const removeCredential = useCallback((id: string, idx: number) => {
    setUpstreams((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const creds = [...(cur.draft.codePlanCredentials ?? [])];
      creds.splice(idx, 1);
      return { ...prev, [id]: { ...cur, draft: { ...cur.draft, codePlanCredentials: creds } } };
    });
  }, []);

  /* ---------- model routes ---------- */

  const addRoute = useCallback(() => {
    let base = "new-model";
    let n = 1;
    while (routes[base]) base = `new-model-${++n}`;
    setRoutes((prev) => ({ ...prev, [base]: { upstream: order[0] ?? "" } }));
  }, [routes, order]);

  const patchRoute = useCallback(
    (modelKey: string, patch: Partial<ModelRouteView>) => {
      setRoutes((prev) => {
        const cur = prev[modelKey];
        if (!cur) return prev;
        return { ...prev, [modelKey]: { ...cur, ...patch } };
      });
    },
    [],
  );

  const renameRouteKey = useCallback(
    (oldKey: string, newKey: string) => {
      setRoutes((prev) => {
        if (oldKey === newKey || prev[newKey] || !newKey) return prev;
        const next: Record<string, ModelRouteView> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k === oldKey ? newKey : k] = v;
        }
        return next;
      });
    },
    [],
  );

  const removeRoute = useCallback((modelKey: string) => {
    setRoutes((prev) => {
      const next = { ...prev };
      delete next[modelKey];
      return next;
    });
  }, []);

  /* ---------- build draft for validate / save ---------- */

  const buildDraft = useCallback((): ProviderConfigDraft => {
    const upstreamsById: Record<string, UpstreamDraft> = {};
    for (const id of order) {
      const st = upstreams[id];
      if (!st) continue;
      const d = st.draft;
      // Strip apiKey in keep mode so we never echo a stale client-side value.
      const apiKey = d.apiKeyMode === "replace" ? (d.apiKey ?? "").trim() : undefined;
      const creds: CredentialDraft[] = (d.codePlanCredentials ?? []).map((c) => ({
        id: c.id.trim(),
        apiKeyMode: c.apiKeyMode,
        // Mirror upstream: empty replace-mode key → undefined (never send
        // "replace with empty string"). Keep mode always sends no key.
        apiKey:
          c.apiKeyMode === "replace"
            ? (c.apiKey ?? "").trim() || undefined
            : undefined,
        weight: Number.isFinite(c.weight) ? c.weight : 1,
        enabled: c.enabled,
      }));
      upstreamsById[id] = {
        baseURL: d.baseURL.trim(),
        apiKeyMode: d.apiKeyMode,
        apiKey: apiKey || undefined,
        model: d.model.trim(),
        provider: d.provider,
        codePlanCredentials: creds,
        quotaLimits: d.quotaLimits,
      };
    }
    const modelRoutes: Record<string, ModelRouteView> = {};
    for (const [model, r] of Object.entries(routes)) {
      modelRoutes[model] = { upstream: r.upstream, model: r.model };
    }
    const draft: ProviderConfigDraft = { upstreamsById, modelRoutes };
    // Re-emit defaultUpstream so a save round-trips any persisted default
    // instead of dropping it. Same shape/normalization as a named upstream.
    if (defaultUpstream) {
      const dd = defaultUpstream.draft;
      const dKey = dd.apiKeyMode === "replace" ? (dd.apiKey ?? "").trim() || undefined : undefined;
      const dCreds: CredentialDraft[] = (dd.codePlanCredentials ?? []).map((c) => ({
        id: c.id.trim(),
        apiKeyMode: c.apiKeyMode,
        apiKey:
          c.apiKeyMode === "replace"
            ? (c.apiKey ?? "").trim() || undefined
            : undefined,
        weight: Number.isFinite(c.weight) ? c.weight : 1,
        enabled: c.enabled,
      }));
      draft.defaultUpstream = {
        baseURL: dd.baseURL.trim(),
        apiKeyMode: dd.apiKeyMode,
        apiKey: dKey,
        model: dd.model.trim(),
        provider: dd.provider,
        codePlanCredentials: dCreds,
        quotaLimits: dd.quotaLimits,
      };
    }
    return draft;
  }, [order, upstreams, routes, defaultUpstream]);

  /* ---------- validation error map ---------- */

  const applyIssues = useCallback((issues: ValidationIssue[]) => {
    const map: Record<string, string> = {};
    for (const iss of issues) {
      // path examples: "upstreamsById.foo.apiKey", "modelRoutes.bar"
      const key = iss.path || "_";
      if (!map[key]) map[key] = iss.message;
    }
    setFieldErrors(map);
  }, []);

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /* ---------- save flow ---------- */

  const savePollTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (savePollTimer.current !== null) window.clearTimeout(savePollTimer.current);
    };
  }, []);

  const expectedUpstreamIds = useRef<Set<string>>(new Set());
  const expectedModels = useRef<Set<string>>(new Set());

  const pollEffective = useCallback(
    async (probeIdx: number) => {
      if (probeIdx >= EFFECTIVE_POLL_MS.length) {
        setBanner({ kind: "warn", text: "保存成功，暂未检测到生效" });
        setBusy(false);
        return;
      }
      const delay = EFFECTIVE_POLL_MS[probeIdx];
      savePollTimer.current = window.setTimeout(async () => {
        const res = await fetchProviderEffectiveConfig();
        if (res.rc !== 0) {
          // keep polling; proxy might still be reloading
          await pollEffective(probeIdx + 1);
          return;
        }
        const eff = res.data ?? null;
        setEffective(eff);
        setProxyOnline(true);
        const upIds = new Set((eff?.upstreams ?? []).map((u) => u.upstreamId));
        const models = new Set((eff?.models ?? []).map((m) => m.model));
        const upOk = Array.from(expectedUpstreamIds.current).every((x) => upIds.has(x));
        const moOk = Array.from(expectedModels.current).every((x) => models.has(x));
        if (upOk && moOk) {
          setBanner({ kind: "ok", text: "配置已生效" });
          setBusy(false);
          return;
        }
        await pollEffective(probeIdx + 1);
      }, delay);
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setBanner(null);
    setFieldErrors({});

    const draft = buildDraft();

    // basic client-side id format check (fast-fail before network)
    const idFormatIssues: ValidationIssue[] = [];
    for (const id of Object.keys(draft.upstreamsById ?? {})) {
      if (!UPSTREAM_ID_RE.test(id)) {
        idFormatIssues.push({ path: `upstreamsById.${id}`, message: "upstreamId 仅允许字母、数字、下划线与连字符" });
      }
    }
    if (idFormatIssues.length > 0) {
      applyIssues(idFormatIssues);
      setBanner({ kind: "err", text: "存在校验错误，已阻止保存" });
      setBusy(false);
      return;
    }

    // validate
    const valRes = await validateProviderConfig(draft);
    if (valRes.rc !== 0) {
      setBanner({ kind: "err", text: `校验请求失败：${valRes.message || "未知错误"}` });
      setBusy(false);
      return;
    }
    const val = valRes.data ?? { ok: false, errors: [], warnings: [] };
    if (val.errors && val.errors.length > 0) {
      applyIssues(val.errors);
      setBanner({ kind: "err", text: `配置存在 ${val.errors.length} 项错误，已阻止保存` });
      setBusy(false);
      return;
    }
    if (val.warnings && val.warnings.length > 0) {
      applyIssues(val.warnings);
      const accepted = window.confirm(
        `检测到 ${val.warnings.length} 项警告，确认继续保存？\n\n${val.warnings.map((w) => `· ${w.path}: ${w.message}`).slice(0, 5).join("\n")}`,
      );
      if (!accepted) {
        setBanner({ kind: "warn", text: "已取消保存（用户在警告确认时取消）" });
        setBusy(false);
        return;
      }
    }

    // save
    const saveRes = await saveProviderConfig(draft);
    if (saveRes.rc !== 0) {
      setBanner({ kind: "err", text: `保存失败：${saveRes.message || "未知错误"}` });
      setBusy(false);
      return;
    }
    if (typeof saveRes.data?.savedAt === "number") setUpdatedAt(saveRes.data.savedAt);
    if (saveRes.data?.configPath) setConfigPath(saveRes.data.configPath);

    // record what we expect to see in effective config, then poll
    expectedUpstreamIds.current = new Set(Object.keys(draft.upstreamsById ?? {}));
    expectedModels.current = new Set(Object.keys(draft.modelRoutes ?? {}));
    await pollEffective(0);
  }, [busy, buildDraft, applyIssues, pollEffective]);

  /* ---------- render ---------- */

  const selected = selectedId ? upstreams[selectedId] : null;
  const routeList = useMemo(() => Object.entries(routes), [routes]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Provider 配置</h1>
            <p className="mt-1 text-sm text-slate-500">
              管理 CrewProxy 上游 Provider、凭据池与模型路由
            </p>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || loading}
            className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors",
              "bg-sky-600 text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {busy ? "处理中…" : "保存并生效"}
          </button>
        </header>

        {/* status bar */}
        <StatusBar
          configPath={configPath}
          proxyOnline={proxyOnline}
          updatedAt={updatedAt}
          effective={effective}
          loading={loading}
        />

        {banner ? (
          <div
            className={classNames(
              "rounded-xl border px-4 py-3 text-sm",
              banner.kind === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
              banner.kind === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
              banner.kind === "err" && "border-rose-200 bg-rose-50 text-rose-800",
            )}
            role="alert"
          >
            {banner.text}
          </div>
        ) : null}

        {/* defaultUpstream: read-only round-trip indicator (saved verbatim) */}
        {!loading && defaultUpstream ? (
          <DefaultUpstreamCard state={defaultUpstream} />
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            加载中…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* left: provider list */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Providers</h2>
                <button
                  type="button"
                  onClick={addUpstream}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + 新增
                </button>
              </div>
              <ul className="divide-y divide-slate-100">
                {order.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-slate-400">暂无 provider，点“新增”开始配置</li>
                ) : (
                  order.map((id) => {
                    const st = upstreams[id];
                    if (!st) return null;
                    const credCount = st.draft.codePlanCredentials?.length ?? 0;
                    const isSelected = id === selectedId;
                    const live = effectiveUpstreamIds.has(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(id)}
                          className={classNames(
                            "w-full px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-sky-50/60" : "hover:bg-slate-50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">{id}</span>
                            <span
                              className={classNames(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                live
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              <span
                                className={classNames(
                                  "h-1.5 w-1.5 rounded-full",
                                  live ? "bg-emerald-500" : "bg-slate-400",
                                )}
                              />
                              {live ? "已生效" : "未生效"}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            {st.draft.provider || "—"} · {hostOf(st.draft.baseURL)}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            token pool: {credCount} · model: {st.draft.model || "—"}
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              {selected ? (
                <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
                  <button
                    type="button"
                    onClick={duplicateSelected}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    删除
                  </button>
                </div>
              ) : null}
            </section>

            {/* right: editor */}
            <section className="space-y-6">
              {selected && selectedId ? (
                <UpstreamEditor
                  key={selectedId}
                  id={selectedId}
                  state={selected}
                  fieldErrors={fieldErrors}
                  onPatchDraft={(p) => patchDraft(selectedId, p)}
                  onSwitchApiKeyMode={(m) => switchApiKeyMode(selectedId, m)}
                  onAddCredential={() => addCredential(selectedId)}
                  onPatchCredential={(i, p) => patchCredential(selectedId, i, p)}
                  onRemoveCredential={(i) => removeCredential(selectedId, i)}
                  onClearFieldError={clearFieldError}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  请在左侧选择一个 provider，或新增一个。
                </div>
              )}

              {/* model routes */}
              <ModelRoutesEditor
                routes={routeList}
                upstreamIds={order}
                fieldErrors={fieldErrors}
                onAdd={addRoute}
                onPatch={patchRoute}
                onRenameKey={renameRouteKey}
                onRemove={removeRoute}
                onClearFieldError={clearFieldError}
                effectiveModels={effectiveModels}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status bar                                                         */
/* ------------------------------------------------------------------ */

function StatusBar({
  configPath,
  proxyOnline,
  updatedAt,
  effective,
  loading,
}: {
  configPath: string;
  proxyOnline: boolean | null;
  updatedAt: number | null;
  effective: EffectiveConfig | null;
  loading: boolean;
}) {
  const updatedText =
    updatedAt === null
      ? "—"
      : new Date(updatedAt).toLocaleString(undefined, { hour12: false });
  const effText =
    effective === null
      ? "—"
      : `${effective.upstreams?.length ?? 0} 上游 / ${effective.models?.length ?? 0} 模型`;
  return (
    <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
      <Stat label="配置文件" value={configPath || (loading ? "…" : "—")} mono />
      <Stat
        label="CrewProxy"
        value={
          proxyOnline === null ? "检测中…" : proxyOnline ? "在线" : "离线"
        }
        tone={proxyOnline ? "ok" : proxyOnline === false ? "err" : "muted"}
      />
      <Stat label="最近保存" value={updatedText} />
      <Stat label="生效状态" value={effText} />
    </section>
  );
}

function Stat({
  label,
  value,
  mono = false,
  tone = "muted",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "muted" | "ok" | "err";
}) {
  const valueClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "err"
        ? "text-rose-700"
        : "text-slate-900";
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={classNames(
          "mt-0.5 truncate text-sm font-semibold",
          mono && "font-mono text-xs",
          valueClass,
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Default upstream card (read-only round-trip)                       */
/* ------------------------------------------------------------------ */

/**
 * Renders the persisted defaultUpstream as a read-only indicator. The value
 * is re-emitted verbatim on save (see buildDraft), so it is never lost.
 * Named upstreams are edited above; this just confirms the default survived.
 */
function DefaultUpstreamCard({ state }: { state: UpstreamState }) {
  const d = state.draft;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">defaultUpstream</h2>
          <p className="text-xs text-slate-500">
            持久化的默认上游（只读，保存时原样回写）
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
          {d.provider || "custom"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">baseURL</dt>
          <dd className="mt-0.5 truncate font-mono text-slate-800" title={d.baseURL}>
            {d.baseURL || "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">model</dt>
          <dd className="mt-0.5 truncate font-mono text-slate-800" title={d.model}>
            {d.model || "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">apiKey</dt>
          <dd className="mt-0.5 truncate font-mono text-slate-500" title="已保存的 apiKey（系统不回显完整值）">
            {state.hasApiKey ? state.apiKeyMasked || "••••••••（已配置）" : "未配置"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">credentials</dt>
          <dd className="mt-0.5 text-slate-800">
            {d.codePlanCredentials?.length ?? 0}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Upstream editor                                                    */
/* ------------------------------------------------------------------ */

function UpstreamEditor({
  id,
  state,
  fieldErrors,
  onPatchDraft,
  onSwitchApiKeyMode,
  onAddCredential,
  onPatchCredential,
  onRemoveCredential,
  onClearFieldError,
}: {
  id: string;
  state: UpstreamState;
  fieldErrors: Record<string, string>;
  onPatchDraft: (patch: Partial<UpstreamDraft>) => void;
  onSwitchApiKeyMode: (mode: ApiKeyMode) => void;
  onAddCredential: () => void;
  onPatchCredential: (idx: number, patch: Partial<CredentialDraft>) => void;
  onRemoveCredential: (idx: number) => void;
  onClearFieldError: (key: string) => void;
}) {
  const d = state.draft;
  const errKey = (suffix: string) => `upstreamsById.${id}.${suffix}`;
  const errMsg = (suffix: string) => fieldErrors[errKey(suffix)];

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">编辑 Provider</h2>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
          {id}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="upstreamId" hint="仅字母 / 数字 / _ / -">
          <input
            value={id}
            readOnly
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700"
          />
        </Field>
        <Field label="provider">
          <select
            value={d.provider}
            onChange={(e) => onPatchDraft({ provider: e.target.value as ProviderName })}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="baseURL"
        error={errMsg("baseURL")}
        onFocus={() => onClearFieldError(errKey("baseURL"))}
      >
        <input
          type="url"
          value={d.baseURL}
          placeholder="https://api.example.com/v1"
          onChange={(e) => onPatchDraft({ baseURL: e.target.value })}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
      </Field>

      <Field label="model" error={errMsg("model")}>
        <input
          value={d.model}
          placeholder="gpt-4o-mini / glm-4.5 / ..."
          onChange={(e) => onPatchDraft({ model: e.target.value })}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
      </Field>

      <ApiKeyField
        label="上游 apiKey"
        mode={d.apiKeyMode}
        masked={state.apiKeyMasked}
        hasKey={state.hasApiKey}
        value={d.apiKey ?? ""}
        error={errMsg("apiKey")}
        onSwitch={onSwitchApiKeyMode}
        onChange={(v) => onPatchDraft({ apiKey: v })}
        onClearError={() => onClearFieldError(errKey("apiKey"))}
      />

      <Field
        label="quotaLimits.fiveHourTokens"
        hint="5 小时 token 上限，留空表示不限"
      >
        <input
          type="number"
          min={0}
          value={d.quotaLimits?.fiveHourTokens ?? ""}
          onChange={(e) =>
            onPatchDraft({
              quotaLimits: {
                ...d.quotaLimits,
                fiveHourTokens: e.target.value === "" ? undefined : Number(e.target.value),
              },
            })
          }
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
      </Field>

      {/* credentials */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">codePlanCredentials</h3>
            <p className="text-xs text-slate-500">token pool — 多账号轮询，每行一份凭据</p>
          </div>
          <button
            type="button"
            onClick={onAddCredential}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + 新增凭据
          </button>
        </div>
        {(d.codePlanCredentials ?? []).length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">尚未配置凭据</p>
        ) : (
          <ul className="space-y-2">
            {(d.codePlanCredentials ?? []).map((c, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <CredentialRow
                  idx={idx}
                  cred={c}
                  upstreamId={id}
                  fieldErrors={fieldErrors}
                  onPatch={(p) => onPatchCredential(idx, p)}
                  onRemove={() => onRemoveCredential(idx)}
                  onClearFieldError={onClearFieldError}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Credential row                                                     */
/* ------------------------------------------------------------------ */

function CredentialRow({
  idx,
  cred,
  upstreamId,
  fieldErrors,
  onPatch,
  onRemove,
  onClearFieldError,
}: {
  idx: number;
  cred: CredentialDraft;
  upstreamId: string;
  fieldErrors: Record<string, string>;
  onPatch: (patch: Partial<CredentialDraft>) => void;
  onRemove: () => void;
  onClearFieldError: (key: string) => void;
}) {
  const errKey = `upstreamsById.${upstreamId}.codePlanCredentials.${idx}`;
  const idErr = fieldErrors[`${errKey}.id`];
  const apiKeyErr = fieldErrors[`${errKey}.apiKey`];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        <Field label="id" error={idErr} compact>
          <input
            value={cred.id}
            placeholder="credential-name"
            onChange={(e) => onPatch({ id: e.target.value })}
            onFocus={() => onClearFieldError(`${errKey}.id`)}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </Field>
        <Field label="weight" compact>
          <input
            type="number"
            min={0}
            step="0.1"
            value={cred.weight}
            onChange={(e) => onPatch({ weight: Number(e.target.value) })}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </Field>
        <Field label="enabled" compact>
          <label className="flex h-[34px] items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={cred.enabled}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
            />
            <span>{cred.enabled ? "启用" : "停用"}</span>
          </label>
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onRemove}
            aria-label="删除凭据"
            className="h-[34px] rounded-md border border-rose-200 bg-white px-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            删除
          </button>
        </div>
      </div>
      <ApiKeyField
        label="凭据 apiKey"
        mode={cred.apiKeyMode}
        masked={cred.apiKeyMasked ?? ""}
        hasKey={!!cred.hasApiKey}
        value={cred.apiKey ?? ""}
        error={apiKeyErr}
        onSwitch={(m) => onPatch({ apiKeyMode: m, apiKey: m === "replace" ? "" : "" })}
        onChange={(v) => onPatch({ apiKey: v })}
        onClearError={() => onClearFieldError(`${errKey}.apiKey`)}
        compact
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ApiKey field (keep / replace)                                      */
/* ------------------------------------------------------------------ */

function ApiKeyField({
  label,
  mode,
  masked,
  hasKey,
  value,
  error,
  onSwitch,
  onChange,
  onClearError,
  compact = false,
}: {
  label: string;
  mode: ApiKeyMode;
  masked: string;
  hasKey: boolean;
  value: string;
  error?: string;
  onSwitch: (mode: ApiKeyMode) => void;
  onChange: (v: string) => void;
  onClearError: () => void;
  compact?: boolean;
}) {
  const inputPad = compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm";
  return (
    <Field label={label} error={error} compact={compact}>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "keep" ? (
          <div
            className={classNames(
              "flex-1 rounded-lg border border-slate-200 bg-slate-50 font-mono text-slate-500",
              inputPad,
            )}
            title="已保存的 apiKey（系统不回显完整值）"
          >
            {hasKey ? masked || "••••••••（已配置）" : "未配置"}
          </div>
        ) : (
          <input
            type="password"
            value={value}
            placeholder="输入新的 apiKey"
            onChange={(e) => onChange(e.target.value)}
            onFocus={onClearError}
            autoComplete="off"
            spellCheck={false}
            className={classNames(
              "flex-1 rounded-lg border border-slate-200 bg-white font-mono text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400",
              inputPad,
            )}
          />
        )}
        <button
          type="button"
          onClick={() => onSwitch(mode === "keep" ? "replace" : "keep")}
          className={classNames(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            mode === "keep"
              ? "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {mode === "keep" ? "替换" : "保留"}
        </button>
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/*  Model routes editor                                                */
/* ------------------------------------------------------------------ */

function ModelRoutesEditor({
  routes,
  upstreamIds,
  fieldErrors,
  onAdd,
  onPatch,
  onRenameKey,
  onRemove,
  onClearFieldError,
  effectiveModels,
}: {
  routes: Array<[string, ModelRouteView]>;
  upstreamIds: string[];
  fieldErrors: Record<string, string>;
  onAdd: () => void;
  onPatch: (modelKey: string, patch: Partial<ModelRouteView>) => void;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onRemove: (modelKey: string) => void;
  onClearFieldError: (key: string) => void;
  effectiveModels: Set<string>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">模型路由</h2>
          <p className="text-xs text-slate-500">将请求模型映射到指定上游与上游模型</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + 新增路由
        </button>
      </div>
      {routes.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">尚未配置路由</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {routes.map(([model, route]) => {
            const live = effectiveModels.has(model);
            const errKey = `modelRoutes.${model}`;
            const errUp = fieldErrors[`${errKey}.upstream`];
            return (
              <li key={model} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[2fr_2fr_2fr_auto]">
                <Field label="model" compact>
                  <input
                    value={model}
                    onChange={(e) => onRenameKey(model, e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  />
                </Field>
                <Field label="upstream" compact error={errUp}>
                  <select
                    value={route.upstream}
                    onChange={(e) => onPatch(model, { upstream: e.target.value })}
                    onFocus={() => onClearFieldError(`${errKey}.upstream`)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  >
                    <option value="">— 选择上游 —</option>
                    {upstreamIds.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="upstreamModel" compact>
                  <input
                    value={route.model ?? ""}
                    placeholder="（默认与 model 相同）"
                    onChange={(e) => onPatch(model, { model: e.target.value })}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <span
                    title={live ? "已生效" : "未生效"}
                    className={classNames(
                      "mb-1 inline-flex h-[34px] items-center rounded-md px-2 text-[11px] font-medium",
                      live
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {live ? "已生效" : "未生效"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(model)}
                    aria-label="删除路由"
                    className="h-[34px] rounded-md border border-rose-200 bg-white px-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    删除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Field wrapper                                                      */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  error,
  children,
  compact = false,
  onFocus,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  compact?: boolean;
  onFocus?: () => void;
}) {
  return (
    <label className="block min-w-0" onFocus={onFocus}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={classNames("font-medium text-slate-700", compact ? "text-[11px]" : "text-xs")}>
          {label}
        </span>
        {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <div className="mt-1 text-[11px] font-medium text-rose-600">{error}</div>
      ) : null}
    </label>
  );
}
