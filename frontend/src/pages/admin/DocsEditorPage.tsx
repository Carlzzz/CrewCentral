import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";

import DocsMarkdown from "../../components/docs/DocsMarkdown";
import { fetchSessionUserinfo } from "../../lib/api";
import type { DocPageAdmin, NavSection } from "../../lib/docs-api";
import {
  NAV_SECTION_LABELS,
  createAdminPage,
  deleteAdminPage,
  getAdminPage,
  listAdminPages,
  patchAdminPage,
  publishAdminPage,
} from "../../lib/docs-api";

const SECTIONS: NavSection[] = ["getting_started", "device", "skill_dev", "api_ref"];

function SortableRow({
  id,
  title,
  selected,
  onSelect,
  depth,
}: {
  id: string;
  title: string;
  selected: boolean;
  onSelect: () => void;
  depth: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    marginLeft: depth * 12,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors " +
        (selected
          ? "border-sky-200 bg-sky-50 text-sky-900 font-medium"
          : "border-slate-100 bg-white text-slate-700 hover:bg-slate-50")
      }
    >
      <button
        type="button"
        className="cursor-grab touch-none text-slate-300 hover:text-slate-500"
        aria-label="拖拽排序"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={onSelect}>
        {title}
      </button>
    </div>
  );
}

function SiblingTree({
  parentId,
  items,
  navSectionForRoots,
  depth,
  selectedId,
  onSelect,
}: {
  parentId: string | null;
  items: DocPageAdmin[];
  /** 仅根层（parent_id 为空）按分区过滤；子层传 null */
  navSectionForRoots: NavSection | null;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const siblings = useMemo(
    () =>
      items
        .filter((p) => {
          if ((p.parent_id ?? null) !== parentId) return false;
          if (parentId === null && navSectionForRoots !== null) {
            return p.nav_section === navSectionForRoots;
          }
          return true;
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug)),
    [items, parentId, navSectionForRoots],
  );
  const ids = siblings.map((s) => s.id);

  if (siblings.length === 0) return null;

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className="space-y-1">
        {siblings.map((p) => (
          <div key={p.id}>
            <SortableRow
              id={p.id}
              title={p.title}
              depth={depth}
              selected={selectedId === p.id}
              onSelect={() => onSelect(p.id)}
            />
            <SiblingTree
              parentId={p.id}
              items={items}
              navSectionForRoots={null}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </SortableContext>
  );
}

export default function DocsEditorPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<DocPageAdmin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [navSection, setNavSection] = useState<NavSection>("getting_started");
  const [parentId, setParentId] = useState<string>("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [message, setMessage] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async () => {
    const res = await listAdminPages();
    if (res.rc === 0 && res.data?.items) setItems(res.data.items);
  }, []);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (!u || !u.is_admin) {
        navigate("/login", { replace: true });
        return;
      }
      setReady(true);
      await load();
    })();
  }, [load, navigate]);

  useEffect(() => {
    if (!selectedId) return;
    void (async () => {
      const res = await getAdminPage(selectedId);
      if (res.rc !== 0 || !res.data) return;
      const d = res.data;
      setSlug(d.slug);
      setTitle(d.title);
      setBodyMd(d.body_md);
      setNavSection(d.nav_section);
      setParentId(d.parent_id ?? "");
      setStatus(d.status);
    })();
  }, [selectedId]);

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const a = items.find((x) => x.id === active.id);
    const o = items.find((x) => x.id === over.id);
    if (!a || !o || a.parent_id !== o.parent_id) return;
    const siblings = items
      .filter((p) => p.parent_id === a.parent_id)
      .sort((x, y) => x.sort_order - y.sort_order || x.slug.localeCompare(y.slug));
    const oldIndex = siblings.findIndex((x) => x.id === active.id);
    const newIndex = siblings.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(siblings, oldIndex, newIndex);
    await Promise.all(newOrder.map((p, i) => patchAdminPage(p.id, { sort_order: i })));
    await load();
  }

  async function onSave() {
    if (!selectedId) return;
    setMessage(null);
    const res = await patchAdminPage(selectedId, {
      slug: slug.trim(),
      title: title.trim(),
      body_md: bodyMd,
      nav_section: navSection,
      parent_id: parentId.trim() ? parentId.trim() : null,
      status,
    });
    setMessage(res.message || (res.rc === 0 ? "已保存" : "保存失败"));
    if (res.rc === 0) await load();
  }

  async function onPublish() {
    if (!selectedId) return;
    setMessage(null);
    const res = await publishAdminPage(selectedId);
    setMessage(res.message || (res.rc === 0 ? "已发布" : "发布失败"));
    if (res.rc === 0) await load();
  }

  async function onDelete() {
    if (!selectedId) return;
    if (!window.confirm("确定删除该文档？（有子节点时服务端会拒绝）")) return;
    setMessage(null);
    const res = await deleteAdminPage(selectedId);
    setMessage(res.message || (res.rc === 0 ? "已删除" : "删除失败"));
    if (res.rc === 0) {
      setSelectedId(null);
      await load();
    }
  }

  async function onCreate() {
    setMessage(null);
    const s = `new-page-${Date.now().toString(36)}`;
    const res = await createAdminPage({
      slug: s,
      title: "新页面",
      body_md: "# 新页面\n\n",
      nav_section: navSection,
      parent_id: null,
      sort_order: items.filter((p) => p.parent_id == null && p.nav_section === navSection).length,
      status: "draft",
    });
    setMessage(res.message || (res.rc === 0 ? "已创建" : "创建失败"));
    if (res.rc === 0 && res.data?.id) {
      setSelectedId(res.data.id);
      await load();
    }
  }

  const parentOptions = items.filter((p) => p.id !== selectedId);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">文档管理</h1>
            <p className="text-sm text-slate-500">Markdown 编辑、排序与发布（服务端鉴权）</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/docs"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              打开读者视图
            </Link>
          </div>
        </div>

        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <label className="text-xs text-slate-500 font-medium">
                新建分区
                <select
                  value={navSection}
                  onChange={(e) => setNavSection(e.target.value as NavSection)}
                  className="ml-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                >
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {NAV_SECTION_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void onCreate()}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 transition-colors"
              >
                + 新建页面
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-2 custom-scrollbar">
                {SECTIONS.map((sec) => {
                  const roots = items.filter((p) => p.nav_section === sec && p.parent_id == null);
                  if (roots.length === 0) return null;
                  return (
                    <div key={sec}>
                      <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400">
                        {NAV_SECTION_LABELS[sec]}
                      </p>
                      <SiblingTree
                        parentId={null}
                        items={items}
                        navSectionForRoots={sec}
                        depth={0}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                      />
                    </div>
                  );
                })}
              </div>
            </DndContext>
          </div>

          <div className="flex min-h-[70vh] flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {selectedId ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">路径 Slug</span>
                    <input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">标题 Title</span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">所属分区 Section</span>
                    <select
                      value={navSection}
                      onChange={(e) => setNavSection(e.target.value as NavSection)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                    >
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {NAV_SECTION_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">父节点 Parent (可选)</span>
                    <select
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                    >
                      <option value="">无 (作为根节点)</option>
                      {parentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.slug})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                    <span className="mb-1 block">发布状态 Status</span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                      className="w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                    >
                      <option value="draft">草稿 Draft (仅管理员可见)</option>
                      <option value="published">已发布 Published (所有人可见)</option>
                    </select>
                  </label>
                </div>
                
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
                  <label className="flex min-h-[360px] flex-col text-sm font-medium text-slate-700">
                    <span className="mb-1.5 flex items-center justify-between">
                      <span>Markdown 正文</span>
                    </span>
                    <textarea
                      value={bodyMd}
                      onChange={(e) => setBodyMd(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all custom-scrollbar"
                      placeholder="在这里输入 Markdown..."
                    />
                  </label>
                  <div className="flex min-h-[360px] flex-col">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">预览 Preview</span>
                    <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-inner custom-scrollbar docs-content">
                      <DocsMarkdown markdown={bodyMd} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => void onSave()}
                    className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-500 hover:shadow transition-all"
                  >
                    保存页面
                  </button>
                  <button
                    type="button"
                    onClick={() => void onPublish()}
                    className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 hover:shadow transition-all"
                  >
                    保存并发布
                  </button>
                  <div className="flex-1"></div>
                  <button
                    type="button"
                    onClick={() => void onDelete()}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                  >
                    删除此页
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
                <svg className="mb-3 h-12 w-12 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>请在左侧选择一个文档进行编辑，或点击“新建页面”</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
