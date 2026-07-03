import { useEffect, useMemo, useState } from "react";
import ChangelogPanel from "../components/download/ChangelogPanel";
import DownloadButtonGroup from "../components/download/DownloadButtonGroup";
import HeroSection from "../components/download/HeroSection";
import PrerequisiteCard from "../components/download/PrerequisiteCard";
import TopNavBar from "../components/layout/TopNavBar";
import type { AssetPublic, Platform } from "../lib/releases-api";
import { getDownloadContext } from "../lib/releases-api";

function pickInitialPlatform(
  rec: Platform | null,
  assets: AssetPublic[],
): Platform | null {
  if (rec && assets.some((a) => a.platform === rec)) return rec;
  return null;
}

export default function DownloadLandingPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [slogan, setSlogan] = useState("CrewCentral 客户端");
  const [logoUrl, setLogoUrl] = useState("");
  const [version, setVersion] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [changelog, setChangelog] = useState<{ type: "new" | "fix"; text: string }[]>([]);
  const [assets, setAssets] = useState<AssetPublic[]>([]);
  const [recommended, setRecommended] = useState<Platform | null>(null);
  const [selected, setSelected] = useState<Platform | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      const res = await getDownloadContext();
      if (res.rc !== 0 || !res.data) {
        setErr(res.message || "加载失败");
        setLoading(false);
        return;
      }
      const d = res.data;
      setSlogan(d.slogan || "CrewCentral 客户端");
      setLogoUrl(d.logo_url || "");
      setVersion(d.version || "");
      setPublishedAt(d.published_at || null);
      setNotes(d.release_notes_excerpt || "");
      setChangelog(d.changelog_entries || []);
      setAssets(d.all_assets || []);
      setRecommended(d.recommended_platform);
      setSelected(pickInitialPlatform(d.recommended_platform, d.all_assets || []));
      setLoading(false);
    })();
  }, []);

  const activeAsset = useMemo(() => {
    if (!selected) return null;
    return assets.find((a) => a.platform === selected) || null;
  }, [assets, selected]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      alert(`已复制 ${label}`);
    } catch {
      alert("复制失败，请手动选择文本");
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(to_bottom,#fff,#f0f9ff)] text-slate-900">
      <TopNavBar />
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        {loading ? (
          <p className="text-center text-slate-500">加载中…</p>
        ) : err ? (
          <p className="text-center text-red-500">{err}</p>
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
            <div className="space-y-10">
              <HeroSection logoUrl={logoUrl} slogan={slogan} versionLabel={version} />
              {version ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
                  当前发布版本：<span className="font-mono font-medium">{version}</span>
                  {publishedAt ? (
                    <span className="ml-2 text-emerald-700">发布时间：{new Date(publishedAt).toLocaleString()}</span>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  当前暂无已发布版本，请管理员在「客户端发布」中执行“创建并发布”或发布草稿。
                </div>
              )}
              <DownloadButtonGroup
                recommended={recommended}
                assets={assets}
                selected={selected}
                onSelect={(p) => setSelected(p)}
              />
              <PrerequisiteCard platform={selected} />
              <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
                <h2 className="text-sm font-semibold text-slate-700">校验码</h2>
                {!activeAsset ? (
                  <p className="mt-2 text-sm text-slate-500">请选择可用平台以下载并查看校验码。</p>
                ) : (
                  <div className="mt-3 space-y-2 font-mono text-xs text-slate-700">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-500">MD5</span>
                      <button
                        type="button"
                        className="break-all text-left text-sky-700 hover:underline"
                        onClick={() => void copyText("MD5", activeAsset.md5)}
                      >
                        {activeAsset.md5}
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-500">SHA256</span>
                      <button
                        type="button"
                        className="break-all text-left text-sky-700 hover:underline"
                        onClick={() => void copyText("SHA256", activeAsset.sha256)}
                      >
                        {activeAsset.sha256}
                      </button>
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs text-slate-500">
                  应用内升级时的下载进度条由桌面客户端展示；本页不模拟浏览器下载进度。
                </p>
              </div>
            </div>
            <ChangelogPanel entries={changelog} releaseNotes={notes} />
          </div>
        )}
      </div>
    </div>
  );
}
