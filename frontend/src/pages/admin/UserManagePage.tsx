import { useEffect, useMemo, useState } from "react";

import {
  createAdminUser,
  createRole,
  deleteAdminUser,
  deleteAdRoleMapping,
  deleteRole,
  listAdGroups,
  listAdminUsers,
  listAdRoleMappings,
  listRoles,
  patchAdminUser,
  runAdSync,
  unlockUserRole,
  updateRole,
  upsertAdRoleMapping,
  type AdminUserItem,
  type ADGroupItem,
  type ADRoleMappingItem,
  type MenuKeyItem,
  type RoleItem,
} from "../../lib/user-api";

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

function roleColor(role: string) {
  if (role === "super_admin") return "bg-purple-50 text-purple-700 border-purple-200";
  if (role === "viewer") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-indigo-50 text-indigo-700 border-indigo-200";
}

type Tab = "users" | "roles" | "ad";

export default function UserManagePage() {
  const [tab, setTab] = useState<Tab>("users");
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", display_name: "", role: "viewer" });
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "", display_name: "", role: "viewer" });

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [allMenus, setAllMenus] = useState<MenuKeyItem[]>([]);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleForm, setRoleForm] = useState({ key: "", label: "", is_admin: false, menu_keys: [] as string[] });
  const [savingRole, setSavingRole] = useState(false);

  const [adMappings, setAdMappings] = useState<ADRoleMappingItem[]>([]);
  const [adGroups, setAdGroups] = useState<ADGroupItem[]>([]);
  const [editingMapping, setEditingMapping] = useState<ADRoleMappingItem | null>(null);
  const [syncing, setSyncing] = useState(false);

  function flash(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4500);
  }

  async function load() {
    setLoading(true);
    const res = await listAdminUsers();
    if (res.rc === 0 && res.data?.items) setItems(res.data.items);
    setLoading(false);
  }

  async function loadRoles() {
    const res = await listRoles();
    if (res.rc === 0 && res.data) {
      setRoles(res.data.items);
      if (allMenus.length === 0) setAllMenus(res.data.all_menus);
    } else {
      flash("error", res.message || "角色加载失败");
    }
  }

  useEffect(() => {
    void load();
    void loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "roles" && roles.length === 0) void loadRoles();
    if (tab === "ad" && adMappings.length === 0) void loadAdMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (sourceFilter && u.source !== sourceFilter) return false;
      if (!q) return true;
      return [u.display_name, u.email, u.username, u.role_label]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [items, query, roleFilter, sourceFilter]);

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.email || !createForm.password) {
      flash("error", "邮箱和密码不能为空");
      return;
    }
    const res = await createAdminUser({
      email: createForm.email,
      password: createForm.password,
      display_name: createForm.display_name || undefined,
      role: createForm.role,
    });
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "用户已创建" : "创建失败"));
    if (res.rc === 0) {
      setCreateForm({ email: "", password: "", display_name: "", role: "viewer" });
      setShowCreate(false);
      await load();
    }
  }

  function startEdit(u: AdminUserItem) {
    setEditingUser(u);
    setEditForm({
      email: u.email || "",
      password: "",
      display_name: u.display_name || "",
      role: u.role || "viewer",
    });
  }

  async function saveEdit() {
    if (!editingUser) return;
    const res = await patchAdminUser(editingUser.id, {
      email: editForm.email || undefined,
      display_name: editForm.display_name,
      password: editForm.password || undefined,
      role: editForm.role,
    });
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已保存" : "保存失败"));
    if (res.rc === 0) {
      setEditingUser(null);
      await load();
    }
  }

  async function onUnlock(u: AdminUserItem) {
    const res = await unlockUserRole(u.id);
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已解锁" : "操作失败"));
    if (res.rc === 0) await load();
  }

  async function onDeleteUser(u: AdminUserItem) {
    if (!confirm(`确认删除用户「${u.display_name || u.username || u.email}」？此操作不可撤销。`)) return;
    const res = await deleteAdminUser(u.id);
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已删除" : "删除失败"));
    if (res.rc === 0) await load();
  }

  async function onAdSync() {
    setSyncing(true);
    const res = await runAdSync();
    setSyncing(false);
    if (res.rc === 0 && res.data) {
      const d = res.data;
      flash("success", `AD 同步完成：新增 ${d.created}，更新 ${d.updated}，跳过 ${d.skipped}${d.errors.length ? `，失败 ${d.errors.length}` : ""}`);
      await load();
    } else {
      flash("error", res.message || "AD 同步失败");
    }
  }

  function openCreateRole() {
    setEditingRole({
      key: "",
      label: "",
      is_system: false,
      is_admin: false,
      sort_order: 0,
      menu_keys: [],
      user_count: 0,
      ad_mapping_count: 0,
      created_at: null,
      updated_at: null,
    });
    setRoleForm({ key: "", label: "", is_admin: false, menu_keys: [] });
  }

  function startEditRole(r: RoleItem) {
    setEditingRole(r);
    setRoleForm({ key: r.key, label: r.label, is_admin: r.is_admin, menu_keys: [...r.menu_keys] });
  }

  async function saveRole() {
    if (!editingRole) return;
    if (!roleForm.label.trim()) {
      flash("error", "请填写显示名称");
      return;
    }
    if (!editingRole.key && !roleForm.key.trim()) {
      flash("error", "请填写角色标识");
      return;
    }
    setSavingRole(true);
    const body = { label: roleForm.label.trim(), is_admin: roleForm.is_admin, menu_keys: roleForm.menu_keys };
    const res = editingRole.key
      ? await updateRole(editingRole.key, body)
      : await createRole({ key: roleForm.key.trim(), ...body });
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已保存" : "保存失败"));
    if (res.rc === 0) {
      setEditingRole(null);
      await loadRoles();
    }
    setSavingRole(false);
  }

  async function onDeleteRole(role: RoleItem) {
    if (!confirm(`删除角色「${role.label}」？`)) return;
    const res = await deleteRole(role.key);
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已删除" : "删除失败"));
    if (res.rc === 0) await loadRoles();
  }

  async function loadAdMappings() {
    const res = await listAdRoleMappings();
    if (res.rc === 0 && res.data) {
      setAdMappings(res.data.items);
      if (allMenus.length === 0) setAllMenus(res.data.all_menus);
    }
    const g = await listAdGroups();
    if (g.rc === 0 && g.data) setAdGroups(g.data.items);
  }

  async function onDeleteMapping(group: string) {
    if (!confirm(`删除 AD 组「${group}」的角色映射？`)) return;
    const res = await deleteAdRoleMapping(group);
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已删除" : "删除失败"));
    if (res.rc === 0) await loadAdMappings();
  }

  async function openNewMapping() {
    if (adGroups.length === 0) await loadAdMappings();
    setEditingMapping({ ad_group: "", role_key: roles.find((r) => r.key === "viewer")?.key || "viewer", role_label: "", priority: 0, updated_at: null });
  }

  function roleBadge(role: string, label?: string) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${roleColor(role)}`}
      >
        {label || role}
      </span>
    );
  }

  function renderUsersTab() {
    return (
      <>
        {/* Toolbar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索姓名 / 邮箱 / 域账号"
              aria-label="搜索用户"
              className="w-full sm:max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="按角色筛选"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            >
              <option value="">全部角色</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="按来源筛选"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            >
              <option value="">全部来源</option>
              <option value="ad">AD 账号</option>
              <option value="local">本地账号</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onAdSync()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              {syncing ? "同步中…" : "AD 同步"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm"
            >
              {showCreate ? "收起" : "新增用户"}
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4" onSubmit={onCreateUser}>
            <h3 className="text-sm font-bold text-slate-800">新增本地用户</h3>
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
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
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
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3 hidden lg:table-cell">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={5}>正在加载...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={5}>{items.length === 0 ? "暂无用户" : "无匹配结果"}</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{u.display_name || u.username || u.email?.split("@")[0] || "—"}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{u.email || (u.username ? `AD: ${u.username}` : "—")}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    {u.source === "ad" ? (
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">AD</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 border border-slate-200">本地</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      {roleBadge(u.role, u.role_label)}
                      {u.role_locked && (
                        <span title="角色已手动锁定，AD 同步不会覆盖" className="text-xs text-amber-500">🔒</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-500 hidden lg:table-cell">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("zh-CN") : "-"}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1">
                    <button type="button" onClick={() => startEdit(u)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition">编辑</button>
                    {u.role_locked && (
                      <button type="button" onClick={() => void onUnlock(u)} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition">解锁</button>
                    )}
                    <button type="button" onClick={() => void onDeleteUser(u)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400">共 {filtered.length} 位用户{items.length !== filtered.length ? `（已筛选，总计 ${items.length}）` : ""}</p>
      </>
    );
  }

  function renderRolesTab() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">角色管理</h3>
            <p className="text-xs text-slate-400 mt-0.5">系统内置角色不可删除；super_admin 始终拥有全部菜单。自定义角色被用户或 AD 映射引用时不可删除。</p>
          </div>
          <button type="button" onClick={openCreateRole} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">新增角色</button>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-xs border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">管理员</th>
                <th className="px-4 py-3">用户数</th>
                <th className="px-4 py-3">AD 映射</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={6}>加载中...</td></tr>
              ) : roles.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{r.label}</div>
                    <div className="font-mono text-xs text-slate-400">{r.key}</div>
                  </td>
                  <td className="px-4 py-3.5">{r.is_system ? "系统" : "自定义"}</td>
                  <td className="px-4 py-3.5">{r.is_admin ? "是" : "否"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.user_count}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.ad_mapping_count}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1">
                    <button type="button" onClick={() => startEditRole(r)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition">编辑</button>
                    {!r.is_system && (
                      <button type="button" onClick={() => void onDeleteRole(r)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition">删除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderAdTab() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">AD 组 → 角色映射</h3>
            <p className="text-xs text-slate-400 mt-0.5">用户登录/同步时，按命中组的最高优先级决定角色。数字越大优先级越高。</p>
          </div>
          <button type="button" onClick={() => void openNewMapping()} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">新增映射</button>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-xs border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">AD 组 (CN)</th>
                <th className="px-4 py-3">目标角色</th>
                <th className="px-4 py-3">优先级</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adMappings.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={4}>暂无映射，点击「新增映射」开始配置</td></tr>
              ) : adMappings.map((m) => (
                <tr key={m.ad_group} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-700">{m.ad_group}</td>
                  <td className="px-4 py-3.5">
                    <div className="text-slate-700">{m.role_label}</div>
                    <div className="font-mono text-xs text-slate-400">{m.role_key}</div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{m.priority}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1">
                    <button type="button" onClick={() => setEditingMapping({ ...m })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition">编辑</button>
                    <button type="button" onClick={() => void onDeleteMapping(m.ad_group)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderEditUserModal() {
    if (!editingUser) return null;
    const isAd = editingUser.source === "ad";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setEditingUser(null)} />
        <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-5 mx-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">编辑用户</h3>
            <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
          {isAd && (
            <p className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-700">
              AD 账号：域账号 <span className="font-mono">{editingUser.username}</span>。密码由 AD 管理，此处不可改。修改角色将锁定该用户，AD 同步不再覆盖。
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">邮箱</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={editForm.email} onChange={(e) => setEditForm((v) => ({ ...v, email: e.target.value }))} placeholder={isAd ? "AD 未提供邮箱" : "user@example.com"} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">昵称</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={editForm.display_name} onChange={(e) => setEditForm((v) => ({ ...v, display_name: e.target.value }))} placeholder="显示名称" />
            </div>
            {!isAd && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">新密码</label>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" type="password" value={editForm.password} onChange={(e) => setEditForm((v) => ({ ...v, password: e.target.value }))} placeholder="留空不修改" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">角色</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={editForm.role} onChange={(e) => setEditForm((v) => ({ ...v, role: e.target.value }))} aria-label="编辑用户角色">
                {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => void saveEdit()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">保存修改</button>
            <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">取消</button>
          </div>
        </div>
      </div>
    );
  }

  function renderRoleModal() {
    if (!editingRole) return null;
    const isEdit = !!editingRole.key;
    const isSuperAdmin = editingRole.key === "super_admin";
    const setF = (patch: Partial<typeof roleForm>) => setRoleForm((prev) => ({ ...prev, ...patch }));
    const toggleMenu = (key: string) =>
      setRoleForm((prev) => ({
        ...prev,
        menu_keys: prev.menu_keys.includes(key) ? prev.menu_keys.filter((k) => k !== key) : [...prev.menu_keys, key],
      }));
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setEditingRole(null)} />
        <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-5 mx-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">{isEdit ? "编辑角色" : "新增角色"}</h3>
            <button type="button" onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">角色标识 (key)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                value={roleForm.key}
                disabled={isEdit}
                onChange={(e) => setF({ key: e.target.value })}
                placeholder="如 skill_editor"
              />
              {isEdit ? (
                <p className="text-[11px] text-slate-400">已有角色的 key 不可修改</p>
              ) : (
                <p className="text-[11px] text-slate-400">小写字母、数字、下划线，3-64 位，且以字母开头</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">显示名称</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none"
                value={roleForm.label}
                onChange={(e) => setF({ label: e.target.value })}
                placeholder="如 技能编辑者"
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={roleForm.is_admin} disabled={isSuperAdmin} onChange={(e) => setF({ is_admin: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200 disabled:opacity-50" />
            <span className="text-sm text-slate-700">管理员角色（可访问用户管理等后台功能）</span>
          </label>
          {isSuperAdmin && (
            <p className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              super_admin 始终拥有全部菜单权限且不可取消管理员标记。
            </p>
          )}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500">菜单权限</div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-lg border border-slate-100 p-2">
              {allMenus.map((m) => (
                <label key={m.key} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
                  <input type="checkbox" checked={roleForm.menu_keys.includes(m.key)} disabled={isSuperAdmin} onChange={() => toggleMenu(m.key)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200 disabled:opacity-50" />
                  <span className="text-sm text-slate-700">{PERM_LABELS[m.key] || m.label || m.key}</span>
                  <span className="text-[10px] text-slate-400 ml-auto font-mono">{m.key}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => void saveRole()} disabled={savingRole} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm disabled:opacity-50">{savingRole ? "保存中..." : "保存"}</button>
            <button type="button" onClick={() => setEditingRole(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">取消</button>
          </div>
        </div>
      </div>
    );
  }

  function renderMappingModal() {
    if (!editingMapping) return null;
    const m = editingMapping;
    const isNew = !adMappings.some((x) => x.ad_group === m.ad_group);
    const setM = (patch: Partial<ADRoleMappingItem>) => setEditingMapping((prev) => (prev ? { ...prev, ...patch } : prev));
    const save = async () => {
      if (!m.ad_group.trim()) { flash("error", "请选择或填写 AD 组"); return; }
      if (!m.role_key.trim()) { flash("error", "请选择目标角色"); return; }
      const res = await upsertAdRoleMapping({ ad_group: m.ad_group.trim(), role_key: m.role_key, priority: m.priority });
      flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "已保存" : "保存失败"));
      if (res.rc === 0) { setEditingMapping(null); await loadAdMappings(); }
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setEditingMapping(null)} />
        <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-5 mx-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">{isNew ? "新增" : "编辑"} AD 组映射</h3>
            <button type="button" onClick={() => setEditingMapping(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">AD 组 (CN) *</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none disabled:bg-slate-50"
                value={m.ad_group}
                disabled={!isNew}
                onChange={(e) => setM({ ad_group: e.target.value })}
                aria-label="选择 AD 组"
              >
                <option value="">{adGroups.length === 0 ? "正在加载 AD 组..." : "请选择 AD 组"}</option>
                {adGroups.map((g) => (
                  <option key={g.cn} value={g.cn}>
                    {g.description ? `${g.cn} — ${g.description}` : g.cn}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">目标角色 *</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none"
                value={m.role_key}
                onChange={(e) => setM({ role_key: e.target.value })}
                aria-label="选择目标角色"
              >
                {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1" title="当用户同时属于多个已映射的 AD 组时，系统选择优先级数字最大的映射对应的角色。数字越大优先级越高；范围 0-1000，默认 0。">
                优先级
                <span className="text-slate-300 cursor-help text-[10px]">ⓘ</span>
              </label>
              <input type="number" min={0} max={1000} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={m.priority} onChange={(e) => setM({ priority: Number(e.target.value) || 0 })} />
              <p className="text-[11px] text-slate-400">数字越大优先级越高（0-1000）。用户属于多个组时取最高优先级的角色。</p>
            </div>
          </div>
          <p className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
            菜单权限和管理员标记来自所选角色；如需调整，请在「角色管理」中修改角色配置。
          </p>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => void save()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm">保存</button>
            <button type="button" onClick={() => setEditingMapping(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">取消</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">用户与权限</h1>
          <p className="mt-1 text-sm text-slate-500">管理系统用户、角色菜单权限，以及 AD 组到角色的映射</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          {([
            ["users", "用户"],
            ["roles", "角色管理"],
            ["ad", "AD 组映射"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Message toast */}
        {message && (
          <div
            role="status"
            className={`rounded-lg p-3 text-sm border ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {tab === "users" && renderUsersTab()}
        {tab === "roles" && renderRolesTab()}
        {tab === "ad" && renderAdTab()}
      </div>
      {renderEditUserModal()}
      {renderRoleModal()}
      {renderMappingModal()}
    </div>
  );
}
