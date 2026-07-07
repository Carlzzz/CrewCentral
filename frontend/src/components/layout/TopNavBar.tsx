import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { fetchSessionUserinfo } from "../../lib/api";

const BASE_LINK =
  "rounded-full px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900";
const ACTIVE_LINK = "bg-sky-50 text-sky-700";

type MenuItem = { to: string; label: string };

function MenuDropdown({
  label,
  active,
  items,
}: {
  label: string;
  active: boolean;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`${BASE_LINK} ${active ? ACTIVE_LINK : ""} inline-flex items-center gap-1`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="text-xs">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 min-w-[150px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function TopNavBar() {
  const { pathname } = useLocation();
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [menuPermissions, setMenuPermissions] = useState<string[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const skillMenu = useMemo<MenuItem[]>(
    () => [
      { to: "/admin/skills", label: "发现技能" },
      { to: "/admin/skills/upload", label: "上传技能包" },
      { to: "/admin/skills/assignments", label: "权限配置" },
    ],
    [],
  );
  const adminMenu = useMemo<MenuItem[]>(
    () => [
      { to: "/admin/devices", label: "设备管理" },
      { to: "/admin/releases", label: "客户端发布" },
      { to: "/admin/docs", label: "文档管理" },
      { to: "/admin/users", label: "用户管理" },
      { to: "/admin/models", label: "模型权限" },
      { to: "/admin/usage", label: "用量分析" },
      { to: "/admin/gateway", label: "网关监控" },
    ],
    [],
  );
  const skillActive = pathname.startsWith("/admin/skills");
  const adminActive =
    pathname.startsWith("/admin/devices") ||
    pathname.startsWith("/admin/releases") ||
    pathname.startsWith("/admin/docs") ||
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/models") ||
    pathname.startsWith("/admin/usage") ||
    pathname.startsWith("/admin/gateway");

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      setName(u?.display_name || u?.email || "");
      setEmail(u?.email || "");
      setMenuPermissions(u?.menu_permissions ?? []);
    })();
  }, []);

  function can(perm: string): boolean {
    return menuPermissions.includes(perm);
  }

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(ev.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/home" className="flex items-center gap-2.5 text-lg font-semibold text-slate-900">
            <img
              src={`${import.meta.env.BASE_URL}branding/Ambilightlogo.png`}
              alt=""
              className="h-9 w-auto object-contain"
              width={120}
              height={36}
            />
            <span>光羿Crew</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/home" className={({ isActive }) => `${BASE_LINK} ${isActive ? ACTIVE_LINK : ""}`}>
              首页
            </NavLink>
            <NavLink
              to="/download"
              className={({ isActive }) => `${BASE_LINK} ${isActive ? ACTIVE_LINK : ""}`}
            >
              下载
            </NavLink>
            <NavLink to="/docs" className={({ isActive }) => `${BASE_LINK} ${isActive ? ACTIVE_LINK : ""}`}>
              文档
            </NavLink>
            {can("skills") ? (
              <MenuDropdown
                label="技能中心"
                active={skillActive}
                items={skillMenu.filter((x) => (x.to.endsWith("/assignments") ? can("skills.assignments") : can("skills")))}
              />
            ) : null}
            {can("devices") || can("releases") || can("docs.manage") || can("users.manage") || can("models.manage") || can("usage") || can("gateway") ? (
              <MenuDropdown
                label="后台管理"
                active={adminActive}
                items={adminMenu.filter((x) => {
                  if (x.to.endsWith("/devices")) return can("devices");
                  if (x.to.endsWith("/releases")) return can("releases");
                  if (x.to.endsWith("/docs")) return can("docs.manage");
                  if (x.to.endsWith("/users")) return can("users.manage");
                  if (x.to.endsWith("/models")) return can("models.manage");
                  if (x.to.endsWith("/usage")) return can("usage");
                  if (x.to.endsWith("/gateway")) return can("gateway");
                  return false;
                })}
              />
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {name ? (
            <div
              ref={profileRef}
              className="relative"
              onMouseEnter={() => setProfileOpen(true)}
              onMouseLeave={() => setProfileOpen(false)}
            >
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setProfileOpen((v) => !v)}
              >
                {name}
              </button>
              {profileOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  <Link
                    to="/me/profile"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setProfileOpen(false)}
                  >
                    个人中心
                  </Link>
                  <Link
                    to="/me/change-password"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setProfileOpen(false)}
                  >
                    修改密码
                  </Link>
                  <a
                    href={`${import.meta.env.BASE_URL}auth/logout`}
                    className="block rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    退出登录
                  </a>
                </div>
              ) : null}
            </div>
          ) : (
            <Link
              to="/login"
              className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              登录
            </Link>
          )}
          {name && email && email !== name ? (
            <span className="hidden text-xs text-slate-400 lg:block">{email}</span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
