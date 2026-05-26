import { useEffect, useState } from "react";
import {
  listAvailableModels,
  listUserModelPermissions,
  setUserModelPermissions,
  type AvailableModelItem,
  type UserModelPermissionItem,
} from "../../lib/models-api";

export default function ModelPermissionPage() {
  const [users, setUsers] = useState<UserModelPermissionItem[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModelItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Edit state
  const [editingUser, setEditingUser] = useState<UserModelPermissionItem | null>(null);
  const [isRestricted, setIsRestricted] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoadingUsers(true);
    setLoadingModels(true);
    setMessage(null);

    // Load available models from proxy
    try {
      const modelsRes = await listAvailableModels();
      if (modelsRes.rc === 0 && modelsRes.data?.items) {
        setAvailableModels(modelsRes.data.items);
      } else {
        console.warn("Failed to fetch available models:", modelsRes.message);
      }
    } catch (err) {
      console.error("Error fetching models:", err);
    } finally {
      setLoadingModels(false);
    }

    // Load users and permissions
    try {
      const usersRes = await listUserModelPermissions();
      if (usersRes.rc === 0 && usersRes.data?.items) {
        setUsers(usersRes.data.items);
      } else {
        setMessage({ type: "error", text: usersRes.message || "加载用户列表失败" });
      }
    } catch (err) {
      console.error("Error fetching user permissions:", err);
      setMessage({ type: "error", text: "无法连接到服务器，请检查后端服务是否启动" });
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function startEdit(user: UserModelPermissionItem) {
    setEditingUser(user);
    const hasLimit = user.allowed_models !== null;
    setIsRestricted(hasLimit);
    setSelectedModels(user.allowed_models || []);
    setMessage(null);
  }

  function handleToggleModel(modelId: string) {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    );
  }

  function handleRemoveModel(modelId: string) {
    setSelectedModels((prev) => prev.filter((m) => m !== modelId));
  }

  async function handleSave() {
    if (!editingUser) return;
    setSaving(true);
    setMessage(null);

    const payload = isRestricted ? selectedModels : null;

    try {
      const res = await setUserModelPermissions(editingUser.id, payload);
      if (res.rc === 0) {
        setMessage({ type: "success", text: `已成功保存用户 ${editingUser.email} 的模型权限。` });
        setEditingUser(null);
        await loadData();
      } else {
        setMessage({ type: "error", text: res.message || "更新权限失败" });
      }
    } catch (err) {
      console.error("Error saving permissions:", err);
      setMessage({ type: "error", text: "保存失败，请稍后重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">模型权限管理</h1>
            <p className="text-sm text-slate-500 mt-1">控制每个用户能访问的网关 LLM 模型（白名单模式，无记录默认允许全部）</p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-2">
            <button
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950 transition"
            >
              刷新数据
            </button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div
            className={`rounded-lg p-4 text-sm border ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Grid layout containing users table & side editor */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Main Section: Users Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-xs border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">用户 / 邮箱</th>
                    <th className="px-4 py-3">可使用模型范围</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingUsers ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400" colSpan={3}>
                        正在加载用户权限数据...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400" colSpan={3}>
                        未找到任何用户
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isUserEditing = editingUser?.id === u.id;
                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isUserEditing ? "bg-sky-50/50 font-medium" : ""
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-slate-900">{u.display_name || u.email.split("@")[0]}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{u.email}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            {u.allowed_models === null ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/50">
                                全部模型 (无限制)
                              </span>
                            ) : u.allowed_models.length === 0 ? (
                              <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200/50">
                                拒绝所有模型
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-sm">
                                {u.allowed_models.map((m) => (
                                  <span
                                    key={m}
                                    className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 border border-sky-200/50"
                                  >
                                    {m}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm border transition-all ${
                                isUserEditing
                                  ? "bg-sky-600 text-white border-sky-600 hover:bg-sky-700"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              配置权限
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Section: Edit Permissions Panel */}
          <div className="lg:col-span-1">
            {editingUser ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-5 sticky top-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900">配置模型白名单</h3>
                  <p className="text-xs text-slate-500 mt-1">当前用户：{editingUser.email}</p>
                </div>

                {/* Unlimited vs Restricted Toggle */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    权限设置方式
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setIsRestricted(false)}
                      className={`rounded-md py-1.5 text-xs font-semibold transition ${
                        !isRestricted
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      全部模型 (无限制)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRestricted(true)}
                      className={`rounded-md py-1.5 text-xs font-semibold transition ${
                        isRestricted
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      自定义白名单
                    </button>
                  </div>
                </div>

                {isRestricted && (
                  <div className="space-y-4 border-t border-slate-100 pt-4 animate-fadeIn">
                    {/* Checkboxes for available models */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        可选择的网关模型
                      </label>
                      
                      {loadingModels ? (
                        <div className="text-xs text-slate-400 py-2">加载网关模型列表中...</div>
                      ) : availableModels.length === 0 ? (
                        <div className="text-xs text-slate-400 py-2 bg-slate-50 rounded-lg px-2 border border-dashed border-slate-200">
                          网关当前没有配置或在线模型。请在下方输入自定义模型名称。
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                          {availableModels.map((m) => {
                            const checked = selectedModels.includes(m.model_id);
                            return (
                              <label
                                key={m.model_id}
                                className="flex items-start gap-2.5 py-1.5 cursor-pointer text-xs text-slate-700 hover:text-slate-900"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleModel(m.model_id)}
                                  className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                />
                                <div className="leading-tight">
                                  <div className="font-medium text-slate-800">{m.model_alias}</div>
                                  {m.model_id !== m.model_alias && (
                                    <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                                      ID: {m.model_id}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Selected models badges list */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        当前已选择的白名单模型 ({selectedModels.length})
                      </label>
                      {selectedModels.length === 0 ? (
                        <div className="text-xs text-rose-500 font-medium py-1">
                          ⚠️ 未选择任何模型，该用户将无法使用任何服务！
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 border border-slate-100 rounded-lg p-2.5 bg-slate-50/30">
                          {selectedModels.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-100 pl-2 pr-1.5 py-0.5 text-xs font-medium text-sky-800"
                            >
                              <span className="truncate max-w-[120px]">{m}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveModel(m)}
                                className="text-sky-400 hover:text-sky-600 focus:outline-none text-[10px] font-bold p-0.5"
                                aria-label={`移除 ${m}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Save and Cancel buttons */}
                <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {saving ? "正在保存..." : "保存修改"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEditingUser(null)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 border-dashed bg-white p-8 text-center text-slate-400 shadow-sm space-y-2 h-64 flex flex-col justify-center items-center">
                <svg
                  className="mx-auto h-8 w-8 text-slate-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <div className="font-semibold text-slate-600 text-sm">暂未选择任何用户</div>
                <div className="text-xs text-slate-400">点击左侧列表中的“配置权限”开始设置</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
