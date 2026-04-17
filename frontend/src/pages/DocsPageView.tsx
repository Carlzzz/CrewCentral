import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";

import DocsMarkdown from "../components/docs/DocsMarkdown";
import { extractTocFromMarkdown } from "../components/docs/extractToc";
import type { DocPagePayload } from "../lib/docs-api";
import { getDocPageBySlug } from "../lib/docs-api";
import type { DocsOutletContext } from "./DocsReaderLayout";

export default function DocsPageView() {
  const { slug } = useParams<{ slug: string }>();
  const { setToc } = useOutletContext<DocsOutletContext>();
  const [data, setData] = useState<DocPagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      setErr(null);
      const res = await getDocPageBySlug(slug);
      if (res.rc !== 0 || !res.data) {
        setErr(res.message || "加载失败");
        setData(null);
        setToc([]);
        return;
      }
      setData(res.data);
    })();
  }, [slug, setToc]);

  useEffect(() => {
    if (!data?.body_md) {
      setToc([]);
      return;
    }
    setToc(extractTocFromMarkdown(data.body_md));
  }, [data, setToc]);

  if (err) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50/90 px-5 py-8 text-center dark:border-rose-900/50 dark:bg-rose-950/40">
        <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{err}</p>
        <Link
          to="/docs"
          className="mt-4 inline-block text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          返回帮助首页
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">加载中…</p>
      </div>
    );
  }

  return (
    <article className="rounded-3xl border border-slate-100/90 bg-white/90 p-6 shadow-sm ring-1 ring-slate-100/80 dark:border-slate-800 dark:bg-slate-900/70 dark:ring-slate-800 sm:p-8">
      <nav className="mb-6 text-[11px] text-slate-400 dark:text-slate-500">
        <Link to="/docs" className="hover:text-sky-600 dark:hover:text-sky-400">
          帮助文档
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-600 dark:text-slate-300">{data.title}</span>
      </nav>
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
        {data.title}
      </h1>
      <DocsMarkdown markdown={data.body_md} />
    </article>
  );
}
