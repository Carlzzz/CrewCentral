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
      const res = await fetchSkills({ page: 1, page_size: 200 });
      if (res.rc === 0 && res.data) setSkills(res.data.items);
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
      <div className="mx-auto max-w-7xl space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">技能权限配置</h1>
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs text-slate-500">左侧：目标主体</div>
            <select
              aria-label="选择目标类型"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as "user" | "group")}
            >
              <option value="user">用户</option>
              <option value="group">用户组</option>
            </select>
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="输入 user_id 或 group_id"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="text-xs text-slate-500">右侧：勾选技能 + 配置</div>
            <div className="grid max-h-[220px] grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-2">
              {skills.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded p-2 hover:bg-white">
                  <input
                    type="checkbox"
                    checked={selected[s.id]?.enabled ?? false}
                    onChange={(e) => toggleSkill(s.id, e.target.checked)}
                  />
                  <button
                    type="button"
                    className="text-left text-sm text-slate-700 hover:text-sky-700"
                    onClick={() => setActiveSkillId(s.id)}
                  >
                    {s.name} <span className="text-xs text-slate-500">{s.latest_version ?? "-"}</span>
                  </button>
                </label>
              ))}
            </div>
            <SkillConfigEditor value={activeConfig} onChange={setConfig} />
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500"
          onClick={() => void onSave()}
        >
          保存绑定
        </button>
      </div>
    </div>
  );
}
