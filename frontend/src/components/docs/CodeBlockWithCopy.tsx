import hljs from "highlight.js";
import { useEffect, useRef, useState } from "react";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

export default function CodeBlockWithCopy({ className, children }: Props) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = code;
    el.className = className ?? "";
    try {
      hljs.highlightElement(el);
    } catch {
      /* ignore */
    }
  }, [code, className]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("复制失败");
    }
  }

  return (
    <div className="group relative my-4 rounded-lg border border-slate-200 bg-slate-900 dark:border-slate-700">
      <button
        type="button"
        onClick={() => void onCopy()}
        className="absolute right-2 top-2 z-10 rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 opacity-0 transition hover:bg-slate-600 group-hover:opacity-100"
      >
        {copied ? "已复制" : "复制代码"}
      </button>
      <pre className="overflow-x-auto p-4 text-sm">
        <code ref={ref} />
      </pre>
    </div>
  );
}
