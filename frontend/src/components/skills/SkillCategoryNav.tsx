const CATEGORIES = ["全部", "自动化", "采集", "社交", "自定义"] as const;

type Props = {
  active: string;
  onChange: (category: string) => void;
};

export default function SkillCategoryNav({ active, onChange }: Props) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">分类</div>
      <div className="space-y-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              c === active
                ? "bg-sky-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
            onClick={() => onChange(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </aside>
  );
}
