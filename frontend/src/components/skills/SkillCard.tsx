import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SkillListItem } from "../../lib/skills-api";
import { toggleDispatch } from "../../lib/skills-api";

type Props = {
  item: SkillListItem;
  onChanged?: () => void;
};

export default function SkillCard({ item, onChanged }: Props) {
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();

  async function onToggle() {
    const enable = confirm(
      "是否启用全设备分发？开启后客户端才能在 manifest 中看见并下载该技能（需已注册设备 + 符合权限配置）。\n\n确定=开启全部分发，取消=关闭分发（若无其它已启用绑定则客户端不可见）。",
    );
    const res = await toggleDispatch(item.id, {
      enabled: enable,
      scope: "all_devices",
    });
    alert(res.message || (res.rc === 0 ? "已更新" : "更新失败"));
    if (res.rc === 0) onChanged?.();
  }

  function onConfigure() {
    // Navigate to assignment page and optionally we could pass skill ID via state 
    // to auto-select it, but for now just navigate to the page
    navigate("/admin/skills/assignments");
  }

  return (
    <article
      className={`group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 ${
        hover ? "shadow-md ring-1 ring-sky-200 translate-y-[-2px]" : "shadow-sm"
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div>
        <div className="flex items-start gap-4">
          <img
            src={item.icon_url || "https://dummyimage.com/64x64/f8fafc/0ea5e9.png&text=S"}
            alt={`${item.name} icon`}
            className="h-12 w-12 shrink-0 rounded-lg border border-slate-100 bg-slate-50 object-cover p-1"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-base font-semibold text-slate-800">
                {item.name}
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {item.latest_version ?? "v?"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-100">
                {item.category === "custom" ? "自定义" : item.category === "automation" ? "自动化" : item.category === "scraper" ? "采集" : item.category === "social" ? "社交" : item.category}
              </span>
              {item.status === "active" && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> 活跃
                </span>
              )}
              {(item.distribution_enabled ?? false) ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                  分发已开启
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  未开启分发
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-slate-500">
          {item.summary || "暂无技能描述信息。"}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 transition-colors"
            onClick={() => void onToggle()}
          >
            一键分发
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            onClick={onConfigure}
          >
            权限配置
          </button>
        </div>
      </div>
    </article>
  );
}
