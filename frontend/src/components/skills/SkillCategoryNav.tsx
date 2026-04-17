const CATEGORIES = ["全部", "automation", "scraper", "social", "custom"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  "全部": "全部",
  "automation": "自动化",
  "scraper": "采集",
  "social": "社交",
  "custom": "自定义",
};

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
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
    </aside>
  );
}
