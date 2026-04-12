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
        setMsg("请输入关键词");
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
    return <p className="text-slate-500">搜索中…</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        搜索结果 {q ? `「${q}」` : ""}
      </h1>
      {msg ? <p className="text-slate-600 dark:text-slate-400">{msg}</p> : null}
      {items.length === 0 && !msg ? (
        <p className="text-slate-500">未找到匹配文档。</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.slug}>
              <Link
                to={`/docs/${it.slug}`}
                className="font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                {it.title}
              </Link>
              {it.snippet ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{it.snippet}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
