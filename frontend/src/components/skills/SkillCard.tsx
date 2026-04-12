import { useState } from "react";
import type { SkillListItem } from "../../lib/skills-api";
import { fetchSkillVersions, toggleDispatch } from "../../lib/skills-api";

type Props = {
  item: SkillListItem;
  onChanged?: () => void;
};

export default function SkillCard({ item, onChanged }: Props) {
  const [hover, setHover] = useState(false);

  async function onToggle() {
    const enable = confirm(
      "是否启用全设备分发？开启后，所有已在设备管理中出现、且用 Access Token 拉取清单的客户端都会收到该技能（需客户端已注册设备）。\n\n确定=开启，取消=关闭。",
    );
    const res = await toggleDispatch(item.id, {
      enabled: enable,
      scope: "all_devices",
    });
    alert(res.message || (res.rc === 0 ? "已更新" : "更新失败"));
    if (res.rc === 0) onChanged?.();
  }

  async function onViewVersions() {
    const res = await fetchSkillVersions(item.id);
    if (res.rc !== 0 || !res.data) {
      alert(res.message || "加载版本失败");
      return;
    }
    const lines = res.data
      .slice(0, 8)
      .map((v) => `${v.version} | ${v.platforms.join(",") || "-"} | ${v.published_at}`);
    alert(lines.join("\n"));
  }

  return (
    <article
      className={`group rounded-xl border border-slate-200 bg-white p-4 transition ${
        hover ? "shadow-lg ring-1 ring-sky-200" : "shadow-sm"
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-start gap-3">
        <img
          src={item.icon_url || "https://dummyimage.com/64x64/1f2937/93c5fd.png&text=S"}
          alt={`${item.name} icon`}
          className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-slate-900">
            {item.name}
            <span className="ml-2 text-xs text-slate-500">{item.latest_version ?? "v?"}</span>
          </div>
          <div className="line-clamp-2 text-sm text-slate-500">{item.summary || "暂无描述"}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-200"
          onClick={() => void onToggle()}
        >
          一键分发
        </button>
        <button
          type="button"
          className="rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200"
          onClick={() => void onViewVersions()}
        >
          配置
        </button>
      </div>

      <div
        className={`mt-3 flex gap-2 text-xs text-sky-700 transition ${hover ? "opacity-100" : "opacity-0"}`}
      >
        <button type="button" className="hover:underline">查看文档</button>
        <span>·</span>
        <button type="button" className="hover:underline">部署</button>
      </div>
    </article>
  );
}
