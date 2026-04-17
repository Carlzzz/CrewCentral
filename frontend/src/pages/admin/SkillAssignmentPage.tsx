import { useEffect, useMemo, useState } from "react";
import SkillConfigEditor from "../../components/skills/SkillConfigEditor";
import { fetchSkills, saveAssignments, type SkillListItem } from "../../lib/skills-api";

type Selected = Record<string, { enabled: boolean; config: Record<string, unknown> }>;

export default function SkillAssignmentPage() {
  const [targetType, setTargetType] = useState<"user" | "group">("user");
  const [targetId, setTargetId] = useState("");
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [selected, setSelected] = useState<Selected>({});
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchSkills({ page: 1, page_size: 100 });
      if (res.rc === 0 && res.data) {
        setSkills(res.data.items);
      } else {
        console.error("加载技能失败:", res);
        // 如果是服务端 422 等非标准错误结构，给出友好提示
        alert(res.message || "加载技能失败");
      }
    })();
  }, []);

  const activeConfig = useMemo(() => {
    if (!activeSkillId) return {};
    return selected[activeSkillId]?.config || {};
  }, [activeSkillId, selected]);

  function toggleSkill(skillId: string, checked: boolean) {
    setSelected((prev) => ({
      ...prev,
      [skillId]: { enabled: checked, config: prev[skillId]?.config || {} },
    }));
    if (!activeSkillId) setActiveSkillId(skillId);
  }

  function setConfig(v: Record<string, unknown>) {
    if (!activeSkillId) return;
    setSelected((prev) => ({
      ...prev,
      [activeSkillId]: {
        enabled: prev[activeSkillId]?.enabled ?? true,
        config: v,
      },
    }));
  }

  async function onSave() {
    if (!targetId.trim()) {
      alert("请填写目标 ID");
      return;
    }
    const payload = {
      target_type: targetType,
      target_id: targetId.trim(),
      skills: Object.entries(selected).map(([skill_id, v]) => ({
        skill_id,
        enabled: v.enabled,
        config: v.config,
      })),
    };
    const res = await saveAssignments(payload);
    alert(res.message || (res.rc === 0 ? "保存成功" : "保存失败"));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">技能权限配置</h1>
          <p className="mt-1 text-sm text-slate-500">为特定用户或用户组绑定技能，并下发配置参数（权限后端已实装，直接生效于客户端）</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* 左侧目标设置 */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm self-start">
            <div>
              <h2 className="text-base font-semibold text-slate-800">目标主体</h2>
              <p className="mt-1 text-xs text-slate-500">选择要配置技能权限的用户或群组</p>
            </div>
            
            <div className="space-y-4 pt-2">
              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-1 block">主体类型</span>
                <select
                  aria-label="选择目标类型"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as "user" | "group")}
                >
                  <option value="user">单用户 (User)</option>
                  <option value="group">用户组 (Group)</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-1 block">主体 ID</span>
                <input
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder={`输入对应的 ${targetType === 'user' ? 'User ID' : 'Group ID'}`}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                />
              </label>
            </div>
          </div>

          {/* 右侧技能与参数 */}
          <div className="flex min-h-[500px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm md:col-span-2">
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">勾选技能与参数配置</h2>
                  <p className="mt-1 text-xs text-slate-500">在列表中启用技能，并在右侧配置对应的参数</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-500 hover:shadow transition-all"
                  onClick={() => void onSave()}
                >
                  保存配置
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
              {/* 技能列表 */}
              <div className="w-full md:w-1/2 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50 p-4 overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  {skills.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-400">暂无可用技能</div>
                  ) : (
                    skills.map((s) => {
                      const isEnabled = selected[s.id]?.enabled ?? false;
                      const isActive = activeSkillId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center justify-between rounded-lg border p-3 transition-colors cursor-pointer ${
                            isActive 
                              ? "border-sky-200 bg-white ring-1 ring-sky-500 shadow-sm" 
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                          onClick={() => setActiveSkillId(s.id)}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600 cursor-pointer"
                              checked={isEnabled}
                              aria-label={`启用技能: ${s.name}`}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSkill(s.id, e.target.checked);
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-900">{s.name}</div>
                              <div className="truncate text-xs text-slate-500 font-mono mt-0.5">{s.latest_version ?? "未发布"}</div>
                            </div>
                          </div>
                          {isEnabled && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200 whitespace-nowrap">已启用</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 参数编辑器 */}
              <div className="w-full md:w-1/2 p-5 bg-white overflow-y-auto">
                {activeSkillId ? (
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-semibold text-slate-800">
                        {skills.find((s) => s.id === activeSkillId)?.name || "未知技能"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">配置该技能的专属启动参数和环境变量</p>
                    </div>
                    <SkillConfigEditor value={activeConfig} onChange={setConfig} />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400 p-8 text-center">
                    <svg className="mb-4 h-12 w-12 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm">在左侧列表中点击选择技能，即可在此处配置参数</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
