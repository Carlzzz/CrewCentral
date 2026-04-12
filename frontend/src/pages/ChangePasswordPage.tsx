import { useState } from "react";

import TopNavBar from "../components/layout/TopNavBar";
import { changeMyPassword } from "../lib/user-api";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await changeMyPassword(currentPassword, newPassword);
    setMessage(res.message || (res.rc === 0 ? "密码已更新" : "修改失败"));
    if (res.rc === 0) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <form className="rounded-xl border border-slate-200 bg-white p-5" onSubmit={onSubmit}>
          <h1 className="text-xl font-semibold text-slate-900">修改密码</h1>
          <div className="mt-4 space-y-3">
            <input
              type="password"
              placeholder="当前密码"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
            <input
              type="password"
              placeholder="新密码（至少 6 位）"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
            <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-white hover:bg-sky-500">
              提交修改
            </button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </div>
        </form>
      </div>
    </div>
  );
}

