import { useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { DocsOutletContext } from "./DocsReaderLayout";

export default function DocsHomePage() {
  const { setToc } = useOutletContext<DocsOutletContext>();

  useEffect(() => {
    setToc([]);
  }, [setToc]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">帮助文档</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        请从左侧目录选择章节，或从「快速入门」开始阅读。
      </p>
      <Link
        to="/docs/intro-welcome"
        className="mt-4 inline-block text-sky-600 hover:underline dark:text-sky-400"
      >
        打开示例：欢迎使用 →
      </Link>
    </div>
  );
}
