import "highlight.js/styles/github-dark.min.css";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import CodeBlockWithCopy from "./CodeBlockWithCopy";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    h5: [...(defaultSchema.attributes?.h5 ?? []), "id"],
    h6: [...(defaultSchema.attributes?.h6 ?? []), "id"],
  },
};

const components: Components = {
  code({ className, children }) {
    const inline = !String(className ?? "").includes("language-");
    if (inline) {
      return (
        <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800 dark:bg-slate-800 dark:text-slate-100">
          {children}
        </code>
      );
    }
    return <CodeBlockWithCopy className={className}>{children}</CodeBlockWithCopy>;
  },
};

type Props = {
  markdown: string;
  className?: string;
};

export default function DocsMarkdown({ markdown, className }: Props) {
  return (
    <article
      className={
        className ??
        "prose prose-slate max-w-none font-sans text-slate-800 dark:prose-invert dark:text-slate-100 " +
          "prose-headings:scroll-mt-24 prose-a:text-sky-600 prose-pre:bg-transparent dark:prose-a:text-sky-400"
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
