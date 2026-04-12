import { Link } from "react-router-dom";
import type { DocTreeNode, NavSection } from "../../lib/docs-api";
import { NAV_SECTION_LABELS } from "../../lib/docs-api";

const SECTION_ORDER: NavSection[] = ["getting_started", "device", "skill_dev", "api_ref"];

type Props = {
  roots: DocTreeNode[];
  currentSlug: string | null;
  onNavigate?: () => void;
};

function groupBySection(roots: DocTreeNode[]): Map<NavSection, DocTreeNode[]> {
  const m = new Map<NavSection, DocTreeNode[]>();
  for (const s of SECTION_ORDER) m.set(s, []);
  for (const n of roots) {
    const list = m.get(n.nav_section);
    if (list) list.push(n);
  }
  return m;
}

function TreeNodes({
  nodes,
  currentSlug,
  depth,
  onNavigate,
}: {
  nodes: DocTreeNode[];
  currentSlug: string | null;
  depth: number;
  onNavigate?: () => void;
}) {
  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-2 mt-1 space-y-1 border-l border-slate-200 pl-2 dark:border-slate-700"}>
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            to={`/docs/${n.slug}`}
            onClick={() => onNavigate?.()}
            className={
              "block rounded px-2 py-1 text-sm " +
              (currentSlug === n.slug
                ? "bg-sky-100 font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            {n.title}
          </Link>
          {n.children.length > 0 ? (
            <TreeNodes
              nodes={n.children}
              currentSlug={currentSlug}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function DocsSidebarTree({ roots, currentSlug, onNavigate }: Props) {
  const grouped = groupBySection(roots);

  return (
    <div className="space-y-6">
      {SECTION_ORDER.map((sec) => {
        const nodes = grouped.get(sec) ?? [];
        if (nodes.length === 0) return null;
        return (
          <div key={sec}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {NAV_SECTION_LABELS[sec]}
            </p>
            <TreeNodes nodes={nodes} currentSlug={currentSlug} depth={0} onNavigate={onNavigate} />
          </div>
        );
      })}
    </div>
  );
}
