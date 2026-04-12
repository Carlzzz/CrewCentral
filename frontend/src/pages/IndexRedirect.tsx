import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { fetchSessionUserinfo } from "../lib/api";

/**
 * 根路径：已登录则进入平台（管理员进技能大厅，否则进帮助文档）；未登录去登录页。
 */
export default function IndexRedirect() {
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (u) {
        setTo(u.is_admin ? "/admin/skills" : "/docs");
      } else {
        setTo("/home");
      }
    })();
  }, []);

  if (!to) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        加载中…
      </div>
    );
  }

  return <Navigate to={to} replace />;
}
