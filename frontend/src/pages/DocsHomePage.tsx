import { useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { DocsOutletContext } from "./DocsReaderLayout";

export default function DocsHomePage() {
  const { setToc } = useOutletContext<DocsOutletContext>();

  useEffect(() => {
    setToc([]);
  }, [setToc]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-sky-100/90 bg-gradient-to-br from-white via-sky-50/50 to-violet-50/40 p-8 shadow-sm ring-1 ring-slate-100/80 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 dark:ring-slate-800">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-violet-200/30 blur-3xl dark:from-sky-900/30 dark:to-violet-900/20" />
        <h1 className="relative text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          帮助文档
        </h1>
        <p className="relative mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          这里汇总产品与客户端的使用说明、设备与技能相关指引，以及 API 参考。从左侧目录进入章节，或用顶部搜索快速定位。
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <Link
            to="/docs/intro-welcome"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-sky-200/50 transition hover:from-sky-600 hover:to-cyan-600 dark:shadow-none"
          >
            从「欢迎使用」开始
            <span aria-hidden>→</span>
          </Link>
          <Link
            to="/docs/search"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-slate-800/80"
          >
            去搜索页
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">怎么用左侧目录？</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            文档按「快速入门 / 设备 / 技能开发 / API」等分组折叠，点标题即可阅读。手机端可点左上角菜单打开目录。
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">内容从哪来？</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            管理员在后台「文档管理」中编辑 Markdown 并发布；此处为只读阅读页，与站点主导航中的「文档」入口一致。
          </p>
        </div>
      </div>
    </div>
  );
}
