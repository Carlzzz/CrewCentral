import { useEffect, useMemo, useState } from "react";

import {
  createAdminUser,
  deleteAdminUser,
  deleteAdRoleMapping,
  listAdGroups,
  listAdminUsers,
  listAdRoleMappings,
  listRoleMenuPermissions,
  patchAdminUser,
  runAdSync,
  setRoleMenuPermissions,
  unlockUserRole,
  upsertAdRoleMapping,
  type AdminUserItem,
  type ADGroupItem,
  type ADRoleMappingItem,
  type MenuKeyItem,
  type RoleMenuPermItem,
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

  const [rolePerms, setRolePerms] = useState<RoleMenuPermItem[]>([]);
  const [allMenus, setAllMenus] = useState<MenuKeyItem[]>([]);
  const [editingRolePerm, setEditingRolePerm] = useState<string | null>(null);
  const [editMenuKeys, setEditMenuKeys] = useState<string[]>([]);
  const [savingPerm, setSavingPerm] = useState(false);

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

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab === "roles" && rolePerms.length === 0) void loadRolePerms();
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
      role: ROLE_LABELS[u.role] ? u.role : "viewer",
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

  async function loadRolePerms() {
    const res = await listRoleMenuPermissions();
    if (res.rc === 0 && res.data) {
      setRolePerms(res.data.items);
      setAllMenus(res.data.all_menus);
    }
  }

  function startEditRolePerm(role: string, currentKeys: string[]) {
    setEditingRolePerm(role);
    setEditMenuKeys([...currentKeys]);
  }

  function toggleMenuKey(key: string) {
    setEditMenuKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function saveRolePerm() {
    if (!editingRolePerm) return;
    setSavingPerm(true);
    const res = await setRoleMenuPermissions(editingRolePerm, editMenuKeys);
    flash(res.rc === 0 ? "success" : "error", res.message || (res.rc === 0 ? "菜单权限已更新" : "更新失败"));
    if (res.rc === 0) {
      setEditingRolePerm(null);
      await loadRolePerms();
    }
    setSavingPerm(false);
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
    setEditingMapping({ ad_group: "", label: null, menu_keys: [], priority: 0, is_admin: false, updated_at: null });
  }

  function roleBadge(role: string, label?: string) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
          ROLE_COLORS[role] || "bg-indigo-50 text-indigo-700 border-indigo-200"
        }`}
      >
        {label || ROLE_LABELS[role] || role}
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
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-1">内置角色菜单权限</h3>
        <p className="text-xs text-slate-400 mb-4">super_admin 始终拥有全部权限，不可修改。</p>
        {rolePerms.length === 0 ? (
          <div className="text-sm text-slate-400">加载中...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rolePerms.map((rp) => (
              <div key={rp.role} className="rounded-lg border border-slate-100 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  {roleBadge(rp.role)}
                  {rp.role !== "super_admin" && (
                    <button type="button" onClick={() => startEditRolePerm(rp.role, rp.menu_keys)} className="text-xs text-sky-600 hover:text-sky-800 font-medium">编辑</button>
                  )}
                </div>
                {rp.is_default && rp.role !== "super_admin" && <div className="text-[10px] text-slate-400">使用默认配置</div>}
                <div className="flex flex-wrap gap-1">
                  {rp.menu_keys.map((p) => (
                    <span key={p} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{PERM_LABELS[p] || p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
                <th className="px-4 py-3">显示名</th>
                <th className="px-4 py-3">优先级</th>
                <th className="px-4 py-3">管理员</th>
                <th className="px-4 py-3">菜单权限</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adMappings.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={6}>暂无映射，点击「新增映射」开始配置</td></tr>
              ) : adMappings.map((m) => (
                <tr key={m.ad_group} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-700">{m.ad_group}</td>
                  <td className="px-4 py-3.5 text-slate-700">{m.label || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{m.priority}</td>
                  <td className="px-4 py-3.5">{m.is_admin ? <span className="text-xs text-purple-600 font-medium">是</span> : <span className="text-xs text-slate-400">否</span>}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {m.menu_keys.length === 0 ? <span className="text-xs text-slate-300">无</span> : m.menu_keys.map((p) => (
                        <span key={p} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{PERM_LABELS[p] || p}</span>
                      ))}
                    </div>
                  </td>
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
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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

  function renderRolePermModal() {
    if (!editingRolePerm) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setEditingRolePerm(null)} />
        <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-5 mx-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">编辑菜单权限 — {roleBadge(editingRolePerm)}</h3>
            <button type="button" onClick={() => setEditingRolePerm(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {allMenus.map((m) => (
              <label key={m.key} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
                <input type="checkbox" checked={editMenuKeys.includes(m.key)} onChange={() => toggleMenuKey(m.key)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200" />
                <span className="text-sm text-slate-700">{PERM_LABELS[m.key] || m.label || m.key}</span>
                <span className="text-[10px] text-slate-400 ml-auto font-mono">{m.key}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => void saveRolePerm()} disabled={savingPerm} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition shadow-sm disabled:opacity-50">{savingPerm ? "保存中..." : "保存"}</button>
            <button type="button" onClick={() => setEditingRolePerm(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">取消</button>
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
    const toggle = (key: string) => setM({ menu_keys: m.menu_keys.includes(key) ? m.menu_keys.filter((k) => k !== key) : [...m.menu_keys, key] });
    const save = async () => {
      if (!m.ad_group.trim()) { flash("error", "请选择或填写 AD 组"); return; }
      const res = await upsertAdRoleMapping({ ad_group: m.ad_group.trim(), label: m.label || undefined, menu_keys: m.menu_keys, priority: m.priority, is_admin: m.is_admin });
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
              <label className="text-xs font-medium text-slate-500">显示名</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={m.label || ""} onChange={(e) => setM({ label: e.target.value })} placeholder="如 IT运维" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">优先级</label>
              <input type="number" min={0} max={1000} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none" value={m.priority} onChange={(e) => setM({ priority: Number(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-2 rounded-lg px-1 py-2 cursor-pointer select-none">
                <input type="checkbox" checked={m.is_admin} onChange={(e) => setM({ is_admin: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200" />
                <span className="text-sm text-slate-700">授予管理员 (is_admin)</span>
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500">菜单权限</label>
            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 rounded-lg border border-slate-100 p-2">
              {allMenus.map((mk) => (
                <label key={mk.key} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                  <input type="checkbox" checked={m.menu_keys.includes(mk.key)} onChange={() => toggle(mk.key)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200" />
                  <span className="text-sm text-slate-700">{PERM_LABELS[mk.key] || mk.label || mk.key}</span>
                </label>
              ))}
            </div>
          </div>
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
            ["roles", "角色权限"],
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
      {renderRolePermModal()}
      {renderMappingModal()}
    </div>
  );
}
