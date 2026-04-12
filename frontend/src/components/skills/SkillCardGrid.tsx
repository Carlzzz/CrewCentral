import type { SkillListItem } from "../../lib/skills-api";
import SkillCard from "./SkillCard";

type Props = {
  items: SkillListItem[];
  loading: boolean;
  onChanged?: () => void;
};

export default function SkillCardGrid({ items, loading, onChanged }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        加载中...
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        当前分类暂无技能
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <SkillCard key={item.id} item={item} onChanged={onChanged} />
      ))}
    </div>
  );
}
