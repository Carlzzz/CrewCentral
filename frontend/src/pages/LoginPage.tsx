import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (cancelled) return;
      setAdminLoggedIn(Boolean(u?.is_admin));
      setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** OAuth 授权请求 id；须由后端 `/auth/login` 入口生成，直接打开本页没有 state 时无法提交 */
  const canSubmit = useMemo(() => state.length >= 8, [state]);
  const devLoginHref = `${import.meta.env.BASE_URL}auth/login`.replace(/\/{2,}/g, "/");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setErr("缺少有效的 state，请从客户端重新发起登录。");
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await postJson<{ redirect: string }>("/auth/login", {
      email,
      password,
      state,
    });
    setLoading(false);
    if (res.rc !== 0) {
      setErr(res.message || "登录失败");
      return;
    }
    navigate({ pathname: "/consent", search: `?state=${encodeURIComponent(state)}` });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <img
              src={`${import.meta.env.BASE_URL}branding/Ambilightlogo.png`}
              alt=""
              className="h-12 w-auto object-contain opacity-95"
            />
          </div>
          <h1 className="text-xl font-semibold text-white">光羿Crew</h1>
          <p className="mt-1 text-sm text-slate-400">使用账号登录以继续授权</p>
          {sessionChecked && adminLoggedIn ? (
            <div className="mt-4 space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-left">
              <p className="text-xs text-emerald-100/95">检测到您已以管理员身份登录，可直接进入管理后台。</p>
              <button
                type="button"
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                onClick={() => navigate("/admin/skills", { replace: true })}
              >
                进入管理后台
              </button>
              {canSubmit ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-white/15 py-2 text-sm text-slate-200 hover:bg-white/5"
                  onClick={() =>
                    navigate({ pathname: "/consent", search: `?state=${encodeURIComponent(state)}` }, { replace: false })
                  }
                >
                  继续客户端授权流程
                </button>
              ) : null}
            </div>
          ) : null}
          {!canSubmit ? (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-100/90">
              当前地址缺少 <code className="text-amber-200">state</code>，登录按钮不可用。请先点击
              <a href={devLoginHref} className="mx-1 font-medium text-amber-300 underline">
                获取授权并进入登录
              </a>
              （由后端创建会话后跳回本页）。
            </p>
          ) : null}
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">邮箱</label>
            <input
              type="email"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none ring-emerald-500/50 focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">密码</label>
            <input
              type="password"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none ring-emerald-500/50 focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={loading || !canSubmit}
            title={!canSubmit ? "需要有效的 state，请从「获取授权并进入登录」进入" : undefined}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "登录中…" : !canSubmit ? "登录（需先获取 state）" : "登录"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-slate-300 hover:bg-white/5"
            onClick={() => setErr("SSO 集成尚未连接，请使用本地账号或启用 SKIP_AUTH。")}
          >
            使用企业 SSO 登录（占位）
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          <Link to="/cancelled" className="underline">
            取消并返回
          </Link>
        </p>
      </div>
    </div>
  );
}
