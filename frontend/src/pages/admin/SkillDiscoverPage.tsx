import { useEffect, useState } from "react";
import SkillCardGrid from "../../components/skills/SkillCardGrid";
import SkillCategoryNav from "../../components/skills/SkillCategoryNav";
import { fetchSkills, type SkillListItem } from "../../lib/skills-api";

export default function SkillDiscoverPage() {
  const [category, setCategory] = useState("全部");
  const [items, setItems] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetchSkills({ category, keyword, page: 1, page_size: 50 });
    if (res.rc === 0 && res.data) setItems(res.data.items);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="min-h-screen bg-slate-100/80 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">发现技能</h1>
          <p className="text-sm text-slate-500">浏览、搜索并管理已发布的技能包</p>
        </div>

        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索技能名称或 slug"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          />
          <button
            type="button"
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
            onClick={() => void load()}
          >
            搜索
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <SkillCategoryNav active={category} onChange={(c) => setCategory(c)} />
          <SkillCardGrid items={items} loading={loading} onChanged={() => void load()} />
        </div>
      </div>
    </div>
  );
}
