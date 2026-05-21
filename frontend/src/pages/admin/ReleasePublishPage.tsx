import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { fetchSessionUserinfo } from "../../lib/api";
import {
  archiveAdminRelease,
  createAdminRelease,
  deleteAdminRelease,
  listAdminReleases,
  publishAdminRelease,
  restoreAdminRelease,
  type ChangelogEntry,
  type ClientReleaseAdmin,
  type Platform,
} from "../../lib/releases-api";
import { uploadReleasePackage } from "../../lib/user-api";

const PLATFORMS: Platform[] = ["windows", "macos", "linux"];
const DRAFT_KEY = "release-publish-form-draft-v1";

type DraftForm = {
  version: string;
  releaseNotes: string;
  updatePolicy: "optional" | "forced";
  enabled: Record<Platform, boolean>;
  urls: Record<Platform, string>;
  names: Record<Platform, string>;
  md5: Record<Platform, string>;
  sha: Record<Platform, string>;
  changelogLines: ChangelogEntry[];
};

function semverTuple(v: string): [number, number, number] {
  const m = v.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0];
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const PLATFORM_ICONS: Record<Platform, string> = {
  windows: "🪟",
  macos: "🍎",
  linux: "🐧",
};

export default function ReleasePublishPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ClientReleaseAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const [version, setVersion] = useState("1.0.0");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [updatePolicy, setUpdatePolicy] = useState<"optional" | "forced">("optional");
  const [enabled, setEnabled] = useState<Record<Platform, boolean>>({
    windows: true,
    macos: false,
    linux: false,
  });
  const [urls, setUrls] = useState<Record<Platform, string>>({
    windows: "https://",
    macos: "https://",
    linux: "https://",
  });
  const [names, setNames] = useState<Record<Platform, string>>({
    windows: "app-setup.exe",
    macos: "app.dmg",
    linux: "app.deb",
  });
  const [md5, setMd5] = useState<Record<Platform, string>>({
    windows: "",
    macos: "",
    linux: "",
  });
  const [sha, setSha] = useState<Record<Platform, string>>({
    windows: "",
    macos: "",
    linux: "",
  });
  const [changelogLines, setChangelogLines] = useState<ChangelogEntry[]>([
    { type: "new", text: "" },
  ]);

  /* --- button loading states --- */
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [creatingPublish, setCreatingPublish] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* --- confirm dialog --- */
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    variant: "default" | "danger";
    action: (() => Promise<void>) | null;
  }>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "",
    variant: "default",
    action: null,
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  /* --- uploading per-platform --- */
  const [uploadingPlatform, setUploadingPlatform] = useState<Platform | null>(null);

  const latestPublishedId = items
    .filter((x) => x.status === "published")
    .sort((a, b) => {
      const ta = semverTuple(a.version);
      const tb = semverTuple(b.version);
      if (ta[0] !== tb[0]) return tb[0] - ta[0];
      if (ta[1] !== tb[1]) return tb[1] - ta[1];
      if (ta[2] !== tb[2]) return tb[2] - ta[2];
      return 0;
    })[0]?.id;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listAdminReleases();
    if (res.rc === 0 && Array.isArray(res.data?.items)) setItems(res.data.items);
    setLoading(false);
  }, []);

  /** 合并单条发布记录，避免 GET 列表偶发缓存时 UI 不刷新 */
  const applyReleasePatch = useCallback((patch: ClientReleaseAdmin | undefined) => {
    if (!patch?.id) return;
    setItems((prev) => prev.map((x) => (x.id === patch.id ? { ...x, ...patch } : x)));
  }, []);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (!u || !u.is_admin) {
        navigate("/login", { replace: true });
        return;
      }
      setReady(true);
      await load();
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw) as DraftForm;
          setVersion(d.version ?? "1.0.0");
          setReleaseNotes(d.releaseNotes ?? "");
          setUpdatePolicy(d.updatePolicy === "forced" ? "forced" : "optional");
          if (d.enabled) setEnabled(d.enabled);
          if (d.urls) setUrls(d.urls);
          if (d.names) setNames(d.names);
          if (d.md5) setMd5(d.md5);
          if (d.sha) setSha(d.sha);
          if (Array.isArray(d.changelogLines) && d.changelogLines.length > 0) {
            setChangelogLines(d.changelogLines);
          }
          showToast("已恢复上次未提交的发布表单草稿", "info");
        }
      } catch {
        // ignore broken draft payload
      }
    })();
  }, [load, navigate, showToast]);

  useEffect(() => {
    if (!ready) return;
    const payload: DraftForm = {
      version,
      releaseNotes,
      updatePolicy,
      enabled,
      urls,
      names,
      md5,
      sha,
      changelogLines,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }, [ready, version, releaseNotes, updatePolicy, enabled, urls, names, md5, sha, changelogLines]);

  function selectPlatform(p: Platform) {
    setEnabled({
      windows: p === "windows",
      macos: p === "macos",
      linux: p === "linux",
    });
  }

  function addChangelogRow() {
    setChangelogLines((prev) => [...prev, { type: "new", text: "" }]);
  }

  async function onUploadPackage(p: Platform, file: File) {
    setUploadingPlatform(p);
    const res = await uploadReleasePackage(file);
    setUploadingPlatform(null);
    if (res.rc !== 0 || !res.data) {
      showToast(res.message || "上传失败", "error");
      return;
    }
    setUrls((o) => ({ ...o, [p]: res.data!.download_url }));
    setNames((o) => ({ ...o, [p]: res.data!.file_name || file.name }));
    setMd5((o) => ({ ...o, [p]: res.data!.md5 }));
    setSha((o) => ({ ...o, [p]: res.data!.sha256 }));
    showToast(`${PLATFORM_LABELS[p]} 安装包已上传并填充到表单`, "success");
  }

  async function onCreateDraft() {
    setCreatingDraft(true);
    const enabledList = PLATFORMS.filter((p) => enabled[p]);
    const assets = enabledList.map((p) => ({
      platform: p,
      download_url: urls[p].trim(),
      file_name: names[p].trim(),
      md5: md5[p].trim(),
      sha256: sha[p].trim(),
    }));
    const changelog = changelogLines
      .map((c) => ({ type: c.type, text: c.text.trim() }))
      .filter((c) => c.text.length > 0);
    const body = {
      version: version.trim(),
      release_notes: releaseNotes,
      changelog_entries: changelog.length ? changelog : null,
      update_policy: updatePolicy,
      status: "draft",
      enabled_platforms: enabledList,
      assets,
    };
    const res = await createAdminRelease(body);
    setCreatingDraft(false);
    if (res.rc === 0) {
      showToast("草稿已创建", "success");
      localStorage.removeItem(DRAFT_KEY);
      await load();
    } else {
      showToast(res.message || "创建失败", "error");
    }
  }

  async function onCreateAndPublish() {
    setCreatingPublish(true);
    const enabledList = PLATFORMS.filter((p) => enabled[p]);
    const assets = enabledList.map((p) => ({
      platform: p,
      download_url: urls[p].trim(),
      file_name: names[p].trim(),
      md5: md5[p].trim(),
      sha256: sha[p].trim(),
    }));
    const changelog = changelogLines
      .map((c) => ({ type: c.type, text: c.text.trim() }))
      .filter((c) => c.text.length > 0);
    const body = {
      version: version.trim(),
      release_notes: releaseNotes,
      changelog_entries: changelog.length ? changelog : null,
      update_policy: updatePolicy,
      status: "published",
      enabled_platforms: enabledList,
      assets,
    };
    const res = await createAdminRelease(body);
    setCreatingPublish(false);
    if (res.rc === 0) {
      showToast("版本已创建并发布 🎉", "success");
      localStorage.removeItem(DRAFT_KEY);
      await load();
    } else {
      showToast(res.message || "创建失败", "error");
    }
  }

  async function onPublish(id: string) {
    setBusyId(id);
    const res = await publishAdminRelease(id);
    setBusyId(null);
    if (res.rc === 0) {
      showToast("版本已成功发布 🎉", "success");
      await load();
      applyReleasePatch(res.data);
    } else {
      showToast(res.message || "发布失败", "error");
    }
  }

  function requestArchive(id: string, ver: string) {
    setConfirmState({
      open: true,
      title: "归档确认",
      description: `确定要归档版本 ${ver} 吗？归档后用户将无法从该版本下载。`,
      confirmLabel: "确认归档",
      variant: "default",
      action: async () => {
        const res = await archiveAdminRelease(id);
        if (res.rc === 0) {
          showToast(`版本 ${ver} 已归档`, "success");
          await load();
          applyReleasePatch(res.data);
        } else {
          showToast(res.message || "操作失败", "error");
        }
      },
    });
  }

  function requestDelete(id: string, ver: string) {
    setConfirmState({
      open: true,
      title: "删除确认",
      description: `确定要永久删除版本 ${ver} 吗？此操作不可恢复，关联的安装包文件也将被删除。`,
      confirmLabel: "永久删除",
      variant: "danger",
      action: async () => {
        const res = await deleteAdminRelease(id);
        if (res.rc === 0) {
          showToast(res.message || `版本 ${ver} 已删除`, "success");
          await load();
        } else {
          showToast(res.message || "删除失败", "error");
        }
      },
    });
  }

  function requestRestore(id: string, ver: string) {
    setConfirmState({
      open: true,
      title: "恢复确认",
      description: `确定要恢复版本 ${ver} 吗？恢复后，该版本将变回“草稿”状态，需要重新发布才可公开下载。`,
      confirmLabel: "确认恢复",
      variant: "default",
      action: async () => {
        const res = await restoreAdminRelease(id);
        if (res.rc === 0) {
          showToast(`版本 ${ver} 已恢复为草稿`, "success");
          await load();
          applyReleasePatch(res.data);
        } else {
          showToast(res.message || "操作失败", "error");
        }
      },
    });
  }

  async function handleConfirm() {
    if (!confirmState.action) return;
    setConfirmLoading(true);
    try {
      await confirmState.action();
    } finally {
      setConfirmLoading(false);
      setConfirmState((s) => ({ ...s, open: false, action: null }));
    }
  }

  function handleCancelConfirm() {
    if (confirmLoading) return;
    setConfirmState((s) => ({ ...s, open: false, action: null }));
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">客户端发布</h1>
          <p className="mt-1 text-sm text-slate-500">管理版本、下载链接与校验信息</p>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          <span className="mt-0.5 text-lg leading-none">💡</span>
          <p>
            上传安装包仅将文件传到服务器并回填表单，不会自动生成发布记录。
            需点击「创建草稿」或「创建并发布」，下载页只显示已发布版本。
            <strong className="font-medium">各平台安装包互相独立</strong>，上传某平台不影响其他平台。
          </p>
        </div>

        {/* ── New draft form ── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-7">
          <h2 className="text-lg font-semibold text-slate-900">新建草稿</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              版本号
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                placeholder="例如 1.2.0"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              更新策略
              <select
                value={updatePolicy}
                onChange={(e) => setUpdatePolicy(e.target.value as "optional" | "forced")}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="optional">可选更新</option>
                <option value="forced">强制更新</option>
              </select>
            </label>
          </div>
          <label className="mt-5 block text-sm font-medium text-slate-700">
            Release Notes
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              placeholder="描述本次发布的主要内容…"
            />
          </label>

          {/* ── Platforms ── */}
          <div className="mt-7 border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-900">启用平台与安装包</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {PLATFORMS.map((p) => (
                <label
                  key={p}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                    enabled[p]
                      ? "border-sky-200 bg-sky-50 text-sky-800 shadow-sm"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="platform-select"
                    checked={enabled[p]}
                    onChange={() => selectPlatform(p)}
                    className="accent-sky-600"
                  />
                  <span>{PLATFORM_ICONS[p]}</span>
                  {PLATFORM_LABELS[p]}
                </label>
              ))}
            </div>
          </div>

          {PLATFORMS.filter((p) => enabled[p]).map((p) => (
            <div
              key={p}
              className="mt-5 grid grid-cols-1 gap-4 rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50/40 to-indigo-50/20 p-4 md:grid-cols-2"
            >
              <div className="col-span-full flex items-center justify-between border-b border-sky-100/80 pb-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                  {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p]} 平台配置
                </span>
                <label
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    uploadingPlatform === p
                      ? "cursor-wait bg-sky-200 text-sky-600"
                      : "bg-sky-100 text-sky-700 hover:bg-sky-200 hover:shadow-sm"
                  }`}
                >
                  {uploadingPlatform === p ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      上传中…
                    </span>
                  ) : (
                    "+ 上传安装包"
                  )}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploadingPlatform === p}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadPackage(p, f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600 md:col-span-2">
                下载 URL（上传后自动生成，也可手动填写）
                <input
                  value={urls[p]}
                  onChange={(e) => setUrls((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                文件名
                <input
                  value={names[p]}
                  onChange={(e) => setNames((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                MD5
                <input
                  value={md5[p]}
                  onChange={(e) => setMd5((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 md:col-span-2">
                SHA256
                <input
                  value={sha[p]}
                  onChange={(e) => setSha((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </label>
            </div>
          ))}

          {/* ── Changelog ── */}
          <div className="mt-7 border-t border-slate-100 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Changelog 条目</p>
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
                onClick={() => addChangelogRow()}
              >
                + 添加一行
              </button>
            </div>
            {changelogLines.map((row, idx) => (
              <div key={idx} className="flex flex-col gap-2 md:flex-row md:items-center">
                <select
                  aria-label={`Changelog 类型 第 ${idx + 1} 行`}
                  value={row.type}
                  onChange={(e) => {
                    const v = e.target.value as "new" | "fix";
                    setChangelogLines((lines) =>
                      lines.map((l, i) => (i === idx ? { ...l, type: v } : l)),
                    );
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="new">✨ New</option>
                  <option value="fix">🔧 Fix</option>
                </select>
                <input
                  value={row.text}
                  onChange={(e) => {
                    const v = e.target.value;
                    setChangelogLines((lines) =>
                      lines.map((l, i) => (i === idx ? { ...l, text: v } : l)),
                    );
                  }}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  placeholder="描述功能更新或修复项"
                />
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-100"
                  onClick={() => setChangelogLines((lines) => lines.filter((_, i) => i !== idx))}
                >
                  删除
                </button>
              </div>
            ))}
          </div>

          {/* ── Actions ── */}
          <div className="mt-8 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={creatingDraft}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void onCreateDraft()}
            >
              {creatingDraft && <SmallSpinner />}
              创建草稿
            </button>
            <button
              type="button"
              disabled={creatingPublish}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void onCreateAndPublish()}
            >
              {creatingPublish && <SmallSpinner />}
              创建并发布
            </button>
          </div>
        </div>

        {/* ── Release list ── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-7">
          <h2 className="text-lg font-semibold text-slate-900">发布列表</h2>
          {loading ? (
            <div className="mt-6 flex justify-center">
              <svg className="h-6 w-6 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">版本</th>
                    <th className="px-4 py-3.5">状态</th>
                    <th className="px-4 py-3.5">平台</th>
                    <th className="px-4 py-3.5">策略</th>
                    <th className="px-4 py-3.5">发布时间</th>
                    <th className="px-4 py-3.5">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((it) => (
                    <tr key={it.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 font-mono text-xs font-medium">{it.version}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          it.status === 'published' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' :
                          it.status === 'archived' ? 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/60' :
                          'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'
                        }`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                            it.status === 'published' ? 'bg-emerald-500' :
                            it.status === 'archived' ? 'bg-slate-400' :
                            'bg-amber-500'
                          }`} />
                          {it.status === 'published' ? '已发布' : it.status === 'archived' ? '已归档' : '草稿'}
                        </span>
                        {it.id === latestPublishedId ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200/60">
                            最新
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1">
                          {(it.enabled_platforms || []).map((p) => (
                            <span key={p} title={PLATFORM_LABELS[p as Platform]} className="text-base">
                              {PLATFORM_ICONS[p as Platform] || p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {it.update_policy === 'forced' ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 ring-1 ring-rose-200/60">强制</span>
                        ) : (
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200/60">可选</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {it.published_at ? new Date(it.published_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {it.status === "draft" ? (
                            <button
                              type="button"
                              disabled={busyId === it.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void onPublish(it.id)}
                            >
                              {busyId === it.id && <SmallSpinner />}
                              发布
                            </button>
                          ) : null}
                          {it.status !== "archived" ? (
                            <button
                              type="button"
                              disabled={busyId === it.id}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => requestArchive(it.id, it.version)}
                            >
                              归档
                            </button>
                          ) : null}
                          {it.status === "archived" ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === it.id}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => requestRestore(it.id, it.version)}
                              >
                                恢复
                              </button>
                              <button
                                type="button"
                                disabled={busyId === it.id}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => requestDelete(it.id, it.version)}
                              >
                                删除
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                        暂无发布记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel="取消"
        variant={confirmState.variant}
        loading={confirmLoading}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
}

/* ── Small inline spinner ── */
function SmallSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
