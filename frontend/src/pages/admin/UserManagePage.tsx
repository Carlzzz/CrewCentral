import { useEffect, useState } from "react";

import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  patchAdminUser,
  type AdminUserItem,
} from "../../lib/user-api";

const ROLES = ["super_admin", "skill_admin", "ops_admin", "docs_admin", "viewer"] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "超级管理员",
  skill_admin: "技能管理员",
  ops_admin: "运维管理员",
  docs_admin: "文档管理员",
  viewer: "普通用户",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-50 text-purple-700 border-purple-200",
  skill_admin: "bg-amber-50 text-amber-700 border-amber-200",
  ops_admin: "bg-blue-50 text-blue-700 border-blue-200",
  docs_admin: "bg-teal-50 text-teal-700 border-teal-200",
  viewer: "bg-slate-50 text-slate-600 border-slate-200",
};

const PERM_LABELS: Record<string, string> = {
  home: "首页",
  download: "下载中心",
  docs: "文档查看",
  skills: "技能中心",
  "skills.assignments": "技能权限配置",
  devices: "设备管理",
  releases: "客户端发布",
  "docs.manage": "文档管理",
  "users.manage": "用户管理",
  usage: "用量分析",
  "models.manage": "模型权限管理",
};

const ROLE_PERMS: Record<string, string[]> = {
  super_admin: ["home", "download", "docs", "skills", "skills.assignments", "devices", "releases", "docs.manage", "users.manage", "usage", "models.manage"],
  skill_admin: ["home", "download", "docs", "skills", "skills.assignments"],
  ops_admin: ["home", "download", "docs", "devices", "releases", "usage"],
  docs_admin: ["home", "download", "docs", "docs.manage"],
  viewer: ["home", "download", "docs"],
};

export default function UserManagePage() {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", display_name: "", role: "viewer" });
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "", display_name: "", role: "viewer" });
  const [showRoleRef, setShowRoleRef] = useState(false);

  async function load() {
    setLoading(true);
    const res = await listAdminUsers();
    if (res.rc === 0 && res.data?.items) setItems(res.data.items);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function flash(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.email || !createForm.password) { flash("error", "邮箱和密码不能为空"); return; }
    const res = await createAdminUser({ email: createForm.email, password: createForm.password, display_name: createForm.display_name || undefined, role: createForm.role });
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "用户已创建" : "创建失败"));
    if (res.rc === 0) { setCreateForm({ email: "", password: "", display_name: "", role: "viewer" }); setShowCreate(false); await load(); }
  }

  function startEdit(u: AdminUserItem) {
    setEditingUser(u);
    setEditForm({ email: u.email, password: "", display_name: u.display_name || "", role: u.role || "viewer" });
  }

  async function saveEdit() {
    if (!editingUser) return;
    const res = await patchAdminUser(editingUser.id, { email: editForm.email, display_name: editForm.display_name, password: editForm.password || undefined, role: editForm.role });
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已保存" : "保存失败"));
    if (res.rc === 0) { setEditingUser(null); await load(); }
  }

  async function onDeleteUser(u: AdminUserItem) {
    if (!confirm(`确认删除用户「${u.display_name || u.email}」？此操作不可撤销。`)) return;
    const res = await deleteAdminUser(u.id);
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已删除" : "删除失败"));
    if (res.rc === 0) await load();
  }
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">用户管理</h1>
            <p className="text-sm text-slate-500 mt-1">管理系统用户及其角色分配</p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-2">
            <button type="button" onClick={() => setShowRoleRef((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              {showRoleRef ? "隐藏" : "查看"}角色权限
            </button>
            <button type="button" onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">
              {showCreate ? "收起" : "新增用户"}
            </button>
          </div>
        </div>

        {/* Message toast */}
        {message && (
          <div className={`rounded-lg p-3 text-sm border ${message.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
            {message.text}
          </div>
        )}

        {/* Role reference panel */}
        {showRoleRef && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-3">角色权限一览</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ROLES.map((role) => (
                <div key={role} className="rounded-lg border border-slate-100 p-3 space-y-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(ROLE_PERMS[role] || []).map((p) => (
                      <span key={p} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{PERM_LABELS[p] || p}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Create user form */}
        {showCreate && (
          <form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4" onSubmit={onCreateUser}>
            <h3 className="text-sm font-bold text-slate-800">新增用户</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">邮箱 *</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" placeholder="user@example.com" value={createForm.email} onChange={(e) => setCreateForm((v) => ({ ...v, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">初始密码 *</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" type="password" placeholder="至少6位" value={createForm.password} onChange={(e) => setCreateForm((v) => ({ ...v, password: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">昵称</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" placeholder="可选" value={createForm.display_name} onChange={(e) => setCreateForm((v) => ({ ...v, display_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">角色</label>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={createForm.role} onChange={(e) => setCreateForm((v) => ({ ...v, role: e.target.value }))} aria-label="新增用户角色">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">创建</button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">取消</button>
            </div>
          </form>
        )}
        {/* Users table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-xs border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3 hidden lg:table-cell">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={4}>正在加载...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={4}>暂无用户</td></tr>
              ) : items.map((u) => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${editingUser?.id === u.id ? "bg-sky-50/50" : ""}`}>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{u.display_name || u.email.split("@")[0]}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{u.email}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-500 hidden lg:table-cell">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("zh-CN") : "-"}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1">
                    <button type="button" onClick={() => startEdit(u)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition">编辑</button>
                    <button type="button" onClick={() => void onDeleteUser(u)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Edit user panel */}
        {editingUser && (
          <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">编辑用户：{editingUser.email}</h3>
              <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">邮箱</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={editForm.email} onChange={(e) => setEditForm((v) => ({ ...v, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">昵称</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={editForm.display_name} onChange={(e) => setEditForm((v) => ({ ...v, display_name: e.target.value }))} placeholder="显示名称" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">新密码</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" type="password" value={editForm.password} onChange={(e) => setEditForm((v) => ({ ...v, password: e.target.value }))} placeholder="留空不修改" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">角色</label>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={editForm.role} onChange={(e) => setEditForm((v) => ({ ...v, role: e.target.value }))} aria-label="编辑用户角色">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveEdit()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">保存修改</button>
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}