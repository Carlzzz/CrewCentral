import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { adLogin } from "../lib/adAuth";

export default function ADLoginPage() {
  const [params] = useSearchParams();
  const state = params.get("state") || "";
  const navigate = useNavigate();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isClientAuth = useMemo(() => state.length >= 8, [state]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await adLogin(account, password, isClientAuth ? state : undefined);
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
          <h1 className="text-xl font-semibold text-slate-900">企业 AD 登录</h1>
          <p className="mt-1 text-sm text-slate-500">使用 Windows 域账号登录</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">域账号</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-sky-500/40 focus:ring-2"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              placeholder="请输入 Windows 登录名"
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
          <Link
            to={{ pathname: "/login", search: isClientAuth ? `?state=${encodeURIComponent(state)}` : "" }}
            className="block w-full rounded-lg border border-slate-200 py-2.5 text-center text-sm text-slate-600 hover:bg-slate-50"
          >
            使用邮箱账号登录
          </Link>
        </form>
      </div>
    </div>
  );
}
