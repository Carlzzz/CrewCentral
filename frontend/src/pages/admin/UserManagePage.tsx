import { useEffect, useState } from "react";

import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  patchAdminUser,
  patchAdminUserRole,
  type AdminUserItem,
} from "../../lib/user-api";

const ROLES = ["super_admin", "skill_admin", "ops_admin", "docs_admin", "viewer"] as const;

export default function UserManagePage() {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    display_name: "",
    role: "viewer",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    email: "",
    password: "",
    display_name: "",
    role: "viewer",
  });

  async function load() {
    setLoading(true);
    const res = await listAdminUsers();
    if (res.rc === 0 && res.data?.items) setItems(res.data.items);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onToggleRole(u: AdminUserItem) {
    const next = u.role === "viewer" ? "ops_admin" : "viewer";
    const res = await patchAdminUserRole(u.id, next);
    setMessage(res.message || (res.rc === 0 ? "已更新" : "更新失败"));
    if (res.rc === 0) await load();
  }

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await createAdminUser({
      email: createForm.email,
      password: createForm.password,
      display_name: createForm.display_name || undefined,
      role: createForm.role,
    });
    setMessage(res.message || (res.rc === 0 ? "已创建" : "创建失败"));
    if (res.rc === 0) {
      setCreateForm({ email: "", password: "", display_name: "", role: "viewer" });
      await load();
    }
  }

  function startEdit(u: AdminUserItem) {
    setEditingId(u.id);
    setEditForm({
      email: u.email,
      password: "",
      display_name: u.display_name || "",
      role: u.role || "viewer",
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    const res = await patchAdminUser(editingId, {
      email: editForm.email,
      display_name: editForm.display_name,
      password: editForm.password || undefined,
      role: editForm.role,
    });
    setMessage(res.message || (res.rc === 0 ? "已保存" : "保存失败"));
    if (res.rc === 0) {
      setEditingId(null);
      await load();
    }
  }

  async function onDeleteUser(u: AdminUserItem) {
    if (!confirm(`确认删除用户 ${u.email} ？`)) return;
    const res = await deleteAdminUser(u.id);
    setMessage(res.message || (res.rc === 0 ? "已删除" : "删除失败"));
    if (res.rc === 0) await load();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">用户管理</h1>
          <p className="text-sm text-slate-500">基于角色的登录用户权限管理</p>
        </div>
        <form className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5" onSubmit={onCreateUser}>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="邮箱"
            value={createForm.email}
            onChange={(e) => setCreateForm((v) => ({ ...v, email: e.target.value }))}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            type="password"
            placeholder="初始密码"
            value={createForm.password}
            onChange={(e) => setCreateForm((v) => ({ ...v, password: e.target.value }))}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="昵称（可选）"
            value={createForm.display_name}
            onChange={(e) => setCreateForm((v) => ({ ...v, display_name: e.target.value }))}
          />
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={createForm.role}
            onChange={(e) => setCreateForm((v) => ({ ...v, role: e.target.value }))}
            aria-label="新增用户角色"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500">
            新增用户
          </button>
        </form>
        {message ? <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{message}</div> : null}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">邮箱</th>
                <th className="px-3 py-2">昵称</th>
                <th className="px-3 py-2">角色</th>
                <th className="px-3 py-2">菜单权限</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>加载中…</td></tr>
              ) : items.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.display_name || "-"}</td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{(u.menu_permissions || []).join(", ") || "-"}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button type="button" className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={() => startEdit(u)}>编辑</button>
                    <button type="button" className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={() => void onToggleRole(u)}>快速切换</button>
                    <button type="button" className="rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50" onClick={() => void onDeleteUser(u)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">编辑用户</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={editForm.email} onChange={(e) => setEditForm((v) => ({ ...v, email: e.target.value }))} aria-label="编辑邮箱" />
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={editForm.display_name} onChange={(e) => setEditForm((v) => ({ ...v, display_name: e.target.value }))} placeholder="昵称" />
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="password" value={editForm.password} onChange={(e) => setEditForm((v) => ({ ...v, password: e.target.value }))} placeholder="新密码（留空不改）" />
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={editForm.role} onChange={(e) => setEditForm((v) => ({ ...v, role: e.target.value }))} aria-label="编辑用户角色">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="mt-3 space-x-2">
              <button type="button" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500" onClick={() => void saveEdit()}>保存</button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setEditingId(null)}>取消</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

