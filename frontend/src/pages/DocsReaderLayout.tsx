import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import DocsSidebarTree from "../components/docs/DocsSidebarTree";
import DocsToc from "../components/docs/DocsToc";
import DocsTopBar from "../components/docs/DocsTopBar";
import type { TocItem } from "../components/docs/extractToc";
import TopNavBar from "../components/layout/TopNavBar";
import type { DocTreeNode } from "../lib/docs-api";
import { getDocTree } from "../lib/docs-api";

const THEME_KEY = "docs-theme";

function getSlugFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const di = parts.indexOf("docs");
  if (di === -1 || di === parts.length - 1) return null;
  const next = parts[di + 1];
  if (next === "search") return null;
  return next ?? null;
}

export type DocsOutletContext = {
  setToc: (items: TocItem[]) => void;
};

export default function DocsReaderLayout() {
  const { pathname } = useLocation();
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tree, setTree] = useState<DocTreeNode[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void (async () => {
      const res = await getDocTree();
      if (res.rc === 0 && res.data?.roots) setTree(res.data.roots);
    })();
  }, []);

  const currentSlug = useMemo(() => getSlugFromPath(pathname), [pathname]);

  const treeNav = (
    <DocsSidebarTree
      roots={tree}
      currentSlug={currentSlug}
      onNavigate={() => setSidebarOpen(false)}
    />
  );

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <TopNavBar />
        <DocsTopBar
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onMenuClick={() => setSidebarOpen((o) => !o)}
        />
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="关闭目录"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <div className="lg:flex lg:min-h-[calc(100vh-4rem)]">
          <aside
            className={
              "fixed inset-y-0 left-0 z-40 w-[min(100vw,280px)] overflow-y-auto border-r border-slate-200 bg-white p-4 transition dark:border-slate-800 dark:bg-slate-900 lg:static lg:z-0 lg:block lg:w-72 lg:shrink-0 lg:translate-x-0 " +
              (sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
            }
          >
            {treeNav}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
            <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
              <div className="mx-auto max-w-3xl">
                <Outlet context={{ setToc } satisfies DocsOutletContext} />
              </div>
            </main>
            <aside className="sticky top-24 hidden w-56 shrink-0 self-start px-2 py-6 lg:block">
              <DocsToc items={toc} />
            </aside>
          </div>
        </div>
        <div className="border-t border-slate-200 px-4 py-4 lg:hidden dark:border-slate-800">
          <DocsToc items={toc} />
        </div>
      </div>
    </div>
  );
}
