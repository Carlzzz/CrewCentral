import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import TopNavBar from "../../components/layout/TopNavBar";
import { fetchSessionUserinfo } from "../../lib/api";

const ADMIN_PERMS = ["skills", "skills.assignments", "devices", "releases", "docs.manage", "users.manage", "models.manage", "usage", "gateway", "providers.manage"];

export default function AdminLayout() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (!u) { setAllowed(false); return; }
      const perms = u.menu_permissions ?? [];
      setAllowed(ADMIN_PERMS.some((p) => perms.includes(p)));
    })();
  }, []);

  if (allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        加载中…
      </div>
    );
  }
  if (!allowed) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <Outlet />
    </div>
  );
}
