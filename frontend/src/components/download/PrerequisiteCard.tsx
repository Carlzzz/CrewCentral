import type { Platform } from "../../lib/releases-api";

const GIT_LINKS: Record<Platform, string> = {
  windows: "https://git-scm.com/download/win",
  macos: "https://git-scm.com/download/mac",
  linux: "https://git-scm.com/download/linux",
};

const GIT_DOWNLOADS_HOME = "https://git-scm.com/downloads";

type Props = {
  platform: Platform | null;
};

export default function PrerequisiteCard({ platform }: Props) {
  const gitUrl = platform ? GIT_LINKS[platform] : GIT_DOWNLOADS_HOME;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-50 text-orange-500"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M23.55 11.05 12.95.46a1.56 1.56 0 0 0-2.2 0L8.55 2.66l2.79 2.79a1.86 1.86 0 0 1 2.35 2.37l2.69 2.69a1.86 1.86 0 1 1-1.11 1.05l-2.51-2.51v6.6a1.86 1.86 0 1 1-1.53-.05V9.05a1.86 1.86 0 0 1-1.01-2.44L9.44 3.84.46 12.8a1.56 1.56 0 0 0 0 2.2l10.6 10.59a1.56 1.56 0 0 0 2.2 0l10.29-10.29a1.56 1.56 0 0 0 0-2.2z" />
          </svg>
        </span>
        <h2 className="text-sm font-semibold text-slate-700">环境要求</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        客户端运行需要预先安装 <span className="font-medium text-slate-800">Git</span>。若你的电脑尚未安装，请先下载并完成安装后再启动客户端。
      </p>
      <a
        href={gitUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
      >
        下载 Git
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
        </svg>
      </a>
      <p className="mt-2 text-xs text-slate-400">
        链接指向 Git 官方下载页 git-scm.com
      </p>
    </div>
  );
}
