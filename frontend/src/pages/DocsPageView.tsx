import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";

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
    return <p className="text-red-600 dark:text-red-400">{err}</p>;
  }
  if (!data) {
    return <p className="text-slate-500">加载中…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{data.title}</h1>
      <DocsMarkdown markdown={data.body_md} />
    </div>
  );
}
