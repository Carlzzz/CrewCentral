import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type Props = {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onMenuClick: () => void;
};

export default function DocsTopBar({ theme, onToggleTheme, onMenuClick }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const s = q.trim();
    if (!s) return;
    navigate(`/docs/search?q=${encodeURIComponent(s)}`);
  }

  return (
    <header className="sticky top-[57px] z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-2 lg:hidden dark:border-slate-700"
          aria-label="打开目录"
          onClick={onMenuClick}
        >
          ☰
        </button>
        <Link to="/docs" className="shrink-0 text-lg font-semibold text-slate-900 dark:text-slate-100">
          帮助文档
        </Link>
        <form className="mx-auto flex max-w-xl flex-1 gap-2" onSubmit={onSearch}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索文档…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-label="全站搜索"
          />
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            搜索
          </button>
        </form>
        <button
          type="button"
          onClick={onToggleTheme}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
          aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
        >
          {theme === "dark" ? "浅色" : "深色"}
        </button>
      </div>
    </header>
  );
}
