import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchSessionUserinfo, postJson } from "../lib/api";

export default function LoginPage() {
  const [params] = useSearchParams();
  const state = params.get("state") || "";
  const navigate = useNavigate();
  const [email, setEmail] = useState("dev@local");
  const [password, setPassword] = useState("dev");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

  const isClientAuth = useMemo(() => state.length >= 8, [state]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (cancelled) return;
      if (u) {
        setAdminLoggedIn(Boolean(u.is_admin));
        if (!isClientAuth) {
          navigate(u.is_admin ? "/admin/skills" : "/docs", { replace: true });
          return;
        }
      }
      setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isClientAuth, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await postJson<{ redirect: string }>("/auth/login", {
      email,
      password,
      ...(isClientAuth ? { state } : {}),
    });
    setLoading(false);
    if (res.rc !== 0) {
      setErr(res.message || "登录失败");
      return;
    }
    if (isClientAuth) {
      navigate({ pathname: "/consent", search: `?state=${encodeURIComponent(state)}` });
    } else {
      navigate("/", { replace: true });
    }
  }

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_70%_20%,#e0f2fe,transparent_40%),linear-gradient(to_bottom,#fff,#f0f9ff)]">
        <p className="text-slate-400">加载中…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_70%_20%,#e0f2fe,transparent_40%),linear-gradient(to_bottom,#fff,#f0f9ff)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <img
              src={`${import.meta.env.BASE_URL}branding/Ambilightlogo.png`}
              alt=""
              className="h-12 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">光羿Crew</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isClientAuth ? "使用账号登录以继续授权" : "使用账号登录"}
          </p>

          {sessionChecked && adminLoggedIn && (
            <div className="mt-4 space-y-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-left">
              <p className="text-xs text-sky-800">
                检测到您已以管理员身份登录，可直接进入管理后台。
              </p>
              <button
                type="button"
                className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 py-2.5 text-sm font-medium text-white shadow-sm hover:from-sky-500 hover:to-blue-500"
                onClick={() => navigate("/admin/skills", { replace: true })}
              >
                进入管理后台
              </button>
              {isClientAuth && (
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() =>
                    navigate(
                      { pathname: "/consent", search: `?state=${encodeURIComponent(state)}` },
                      { replace: false },
                    )
                  }
                >
                  继续客户端授权流程
                </button>
              )}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">邮箱</label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-sky-500/40 focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="请输入邮箱"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">密码</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-sky-500/40 focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="请输入密码"
              required
            />
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 py-2.5 font-medium text-white shadow-sm transition hover:from-sky-500 hover:to-blue-500 disabled:opacity-50"
          >
            {loading ? "登录中…" : "登录"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => setErr("SSO 集成尚未连接，请使用本地账号或启用 SKIP_AUTH。")}
          >
            使用企业 SSO 登录（占位）
          </button>
        </form>
      </div>
    </div>
  );
}
