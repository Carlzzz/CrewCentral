import { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import type { SearchHit } from "../lib/docs-api";
import { searchDocs } from "../lib/docs-api";
import type { DocsOutletContext } from "./DocsReaderLayout";

export default function DocsSearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const { setToc } = useOutletContext<DocsOutletContext>();
  const [items, setItems] = useState<SearchHit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setToc([]);
  }, [setToc]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setMsg(null);
      if (!q) {
        setItems([]);
        setMsg("在顶部搜索框输入关键词，或从 URL 带上 ?q= 参数");
        setLoading(false);
        return;
      }
      const res = await searchDocs(q);
      if (res.rc !== 0) {
        setMsg(res.message || "搜索失败");
        setItems([]);
        setLoading(false);
        return;
      }
      setItems(res.data?.items ?? []);
      setLoading(false);
    })();
  }, [q]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">搜索中…</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="rounded-2xl border border-sky-100/80 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
          搜索结果 {q ? <span className="text-sky-600 dark:text-sky-400">「{q}」</span> : null}
        </h1>
        {msg ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{msg}</p>
        ) : null}
      </div>

      {items.length === 0 && !msg ? (
        <p className="rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
          未找到匹配文档，换个关键词试试。
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.slug}>
              <Link
                to={`/docs/${it.slug}`}
                className="block rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-sky-800"
              >
                <span className="font-medium text-sky-700 dark:text-sky-300">{it.title}</span>
                {it.snippet ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{it.snippet}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
