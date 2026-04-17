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
    <header className="sticky top-[57px] z-30 border-b border-sky-100/80 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="rounded-xl border border-slate-200/90 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="打开目录"
          onClick={onMenuClick}
        >
          <span className="text-lg leading-none">☰</span>
        </button>
        <Link
          to="/docs"
          className="shrink-0 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
        >
          帮助文档
        </Link>
        <form className="mx-auto flex max-w-xl flex-1 gap-2" onSubmit={onSearch}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索文档标题与正文…"
            className="w-full rounded-full border border-slate-200/90 bg-white/90 px-4 py-2 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-900/40"
            aria-label="全站搜索"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-sky-200/40 transition hover:from-sky-600 hover:to-cyan-600 dark:shadow-none"
          >
            搜索
          </button>
        </form>
        <button
          type="button"
          onClick={onToggleTheme}
          className="shrink-0 rounded-full border border-slate-200/90 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
        >
          {theme === "dark" ? "浅色" : "深色"}
        </button>
      </div>
    </header>
  );
}
