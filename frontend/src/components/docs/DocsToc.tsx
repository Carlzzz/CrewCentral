import type { TocItem } from "./extractToc";

type Props = {
  items: TocItem[];
};

export default function DocsToc({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">本页暂无标题</p>;
  }

  return (
    <nav className="max-h-[calc(100vh-8rem)] overflow-y-auto border-l border-slate-200 pl-4 text-sm dark:border-slate-700">
      <p className="mb-2 font-semibold text-slate-700 dark:text-slate-200">本页目录</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} style={{ paddingLeft: `${Math.max(0, item.depth - 1) * 0.75}rem` }}>
            <a
              href={`#${item.id}`}
              className="text-slate-600 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
