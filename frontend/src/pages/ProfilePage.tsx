import { useEffect, useState } from "react";

import TopNavBar from "../components/layout/TopNavBar";
import { fetchSessionUserinfo } from "../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<Awaited<ReturnType<typeof fetchSessionUserinfo>>>(null);

  useEffect(() => {
    void (async () => {
      setUser(await fetchSessionUserinfo());
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h1 className="text-xl font-semibold text-slate-900">个人中心</h1>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <p>邮箱：{user?.email || "-"}</p>
            <p>昵称：{user?.display_name || "-"}</p>
            <p>角色：{user?.is_admin ? "管理员" : "普通用户"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

