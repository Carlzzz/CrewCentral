import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSessionUserinfo } from "../../lib/api";
import {
  archiveAdminRelease,
  createAdminRelease,
  listAdminReleases,
  publishAdminRelease,
  type ChangelogEntry,
  type ClientReleaseAdmin,
  type Platform,
} from "../../lib/releases-api";
import { uploadReleasePackage } from "../../lib/user-api";

const PLATFORMS: Platform[] = ["windows", "macos", "linux"];

export default function ReleasePublishPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ClientReleaseAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listAdminReleases();
    if (res.rc === 0 && res.data?.items) setItems(res.data.items);
    setLoading(false);
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
    })();
  }, [load, navigate]);

  function togglePlatform(p: Platform) {
    setEnabled((prev) => ({ ...prev, [p]: !prev[p] }));
  }

  function addChangelogRow() {
    setChangelogLines((prev) => [...prev, { type: "new", text: "" }]);
  }

  async function onUploadPackage(p: Platform, file: File) {
    const res = await uploadReleasePackage(file);
    if (res.rc !== 0 || !res.data) {
      setMessage(res.message || "上传失败");
      return;
    }
    setUrls((o) => ({ ...o, [p]: res.data!.download_url }));
    setNames((o) => ({ ...o, [p]: res.data!.file_name || file.name }));
    setMd5((o) => ({ ...o, [p]: res.data!.md5 }));
    setSha((o) => ({ ...o, [p]: res.data!.sha256 }));
    setMessage("安装包已上传，已自动填充下载链接与校验值。");
  }

  async function onCreateDraft() {
    setMessage(null);
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
    setMessage(res.message || (res.rc === 0 ? "已创建草稿" : "创建失败"));
    if (res.rc === 0) await load();
  }

  async function onPublish(id: string) {
    setMessage(null);
    const res = await publishAdminRelease(id);
    setMessage(res.message || (res.rc === 0 ? "已发布" : "发布失败"));
    if (res.rc === 0) await load();
  }

  async function onArchive(id: string) {
    setMessage(null);
    const res = await archiveAdminRelease(id);
    setMessage(res.message || (res.rc === 0 ? "已归档" : "操作失败"));
    if (res.rc === 0) await load();
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">客户端发布</h1>
          <p className="text-sm text-slate-500">管理版本、下载链接与校验信息（服务端鉴权）</p>
        </div>

        {message ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            {message}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-medium text-slate-900">新建草稿</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-700">
              版本号
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="block text-sm text-slate-700">
              更新策略
              <select
                value={updatePolicy}
                onChange={(e) => setUpdatePolicy(e.target.value as "optional" | "forced")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="optional">可选更新</option>
                <option value="forced">强制更新</option>
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm text-slate-700">
            Release Notes
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-900">启用平台与安装包</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={enabled[p]}
                    onChange={() => togglePlatform(p)}
                    className="accent-sky-600"
                  />
                  {p}平台
                </label>
              ))}
            </div>
          </div>

          {PLATFORMS.filter((p) => enabled[p]).map((p) => (
            <div
              key={p}
              className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-sky-100 bg-sky-50/30 p-4 md:grid-cols-2"
            >
              <div className="col-span-full flex items-center justify-between border-b border-sky-100 pb-2">
                <span className="text-sm font-medium text-sky-900">{p} 平台配置</span>
                <label className="cursor-pointer rounded-md bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-200">
                  + 上传安装包
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadPackage(p, f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-600 md:col-span-2">
                下载 URL（上传后自动生成，也可手动填写）
                <input
                  value={urls[p]}
                  onChange={(e) => setUrls((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
              <label className="block text-xs text-slate-600">
                文件名
                <input
                  value={names[p]}
                  onChange={(e) => setNames((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
              <label className="block text-xs text-slate-600">
                MD5
                <input
                  value={md5[p]}
                  onChange={(e) => setMd5((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
              <label className="block text-xs text-slate-600 md:col-span-2">
                SHA256
                <input
                  value={sha[p]}
                  onChange={(e) => setSha((o) => ({ ...o, [p]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
            </div>
          ))}

          <div className="mt-6 border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Changelog 条目</p>
              <button
                type="button"
                className="text-sm text-sky-600 hover:underline"
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
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="new">New</option>
                  <option value="fix">Fix</option>
                </select>
                <input
                  value={row.text}
                  onChange={(e) => {
                    const v = e.target.value;
                    setChangelogLines((lines) =>
                      lines.map((l, i) => (i === idx ? { ...l, text: v } : l)),
                    );
                  }}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="描述功能更新或修复项"
                />
                <button
                  type="button"
                  className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600 hover:bg-rose-100"
                  onClick={() => setChangelogLines((lines) => lines.filter((_, i) => i !== idx))}
                >
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 hover:shadow"
              onClick={() => void onCreateDraft()}
            >
              创建草稿
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-medium text-slate-900">发布列表</h2>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">加载中…</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">版本</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">策略</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {items.map((it) => (
                    <tr key={it.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">{it.version}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          it.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                          it.status === 'archived' ? 'bg-slate-100 text-slate-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {it.status === 'published' ? '已发布' : it.status === 'archived' ? '已归档' : '草稿'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{it.update_policy === 'forced' ? '强制' : '可选'}</td>
                      <td className="px-4 py-3 space-x-2">
                        {it.status === "draft" ? (
                          <button
                            type="button"
                            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 hover:shadow-sm"
                            onClick={() => void onPublish(it.id)}
                          >
                            发布
                          </button>
                        ) : null}
                        {it.status !== "archived" ? (
                          <button
                            type="button"
                            className="rounded bg-slate-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-500 hover:shadow-sm"
                            onClick={() => void onArchive(it.id)}
                          >
                            归档
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
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
    </div>
  );
}
