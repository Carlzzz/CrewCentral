import type { AssetPublic, Platform } from "../../lib/releases-api";

const LABEL: Record<Platform, { title: string; ext: string }> = {
  windows: { title: "Windows", ext: ".exe" },
  macos: { title: "macOS", ext: ".dmg" },
  linux: { title: "Linux", ext: ".deb" },
};

type Props = {
  recommended: Platform | null;
  assets: AssetPublic[];
  onSelect?: (p: Platform) => void;
  selected: Platform | null;
};

export default function DownloadButtonGroup({ recommended, assets, onSelect, selected }: Props) {
  const by = Object.fromEntries(assets.map((a) => [a.platform, a])) as Partial<
    Record<Platform, AssetPublic>
  >;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
      {(["windows", "macos", "linux"] as const).map((p) => {
        const a = by[p];
        const isRec = recommended === p;
        const isSel = selected === p;
        const disabled = !a;
        const active =
          !disabled &&
          ((recommended !== null && isRec) || (selected !== null && isSel));
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            aria-label={`下载 ${LABEL[p].title} 安装包 ${LABEL[p].ext}`}
            onClick={() => {
              if (!a) return;
              onSelect?.(p);
              const sep = a.download_url.includes("?") ? "&" : "?";
              const withName = `${a.download_url}${sep}download_name=${encodeURIComponent(a.file_name)}`;
              window.open(withName, "_blank", "noopener,noreferrer");
            }}
            className={[
              "min-w-[200px] rounded-xl border px-5 py-3 text-left text-sm font-medium transition",
              disabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : active
                  ? "border-sky-300 bg-sky-50 text-sky-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <span>
                {LABEL[p].title} <span className="text-slate-400">{LABEL[p].ext}</span>
              </span>
              {isRec && !disabled ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                  推荐
                </span>
              ) : null}
            </div>
            {disabled ? (
              <p className="mt-1 text-xs text-slate-500">即将提供</p>
            ) : (
              <p className="mt-1 truncate text-xs text-slate-400">{a.file_name}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
