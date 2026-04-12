import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchConsentContext, fetchSessionUserinfo, postJson } from "../lib/api";

type UserRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function ConsentPage() {
  const [params] = useSearchParams();
  const state = params.get("state") || "";
  const navigate = useNavigate();
  const [user, setUser] = useState<UserRow | null>(null);
  const [clientLabel, setClientLabel] = useState("CrewCentral 客户端");
  const [deviceLabel, setDeviceLabel] = useState("当前设备");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await fetchSessionUserinfo();
      if (cancelled) return;
      if (!u) {
        setErr("请先完成登录");
        setLoading(false);
        return;
      }
      setUser(u);
      if (state.length >= 8) {
        const ctx = await fetchConsentContext(state);
        if (!cancelled && ctx) {
          if (ctx.rc === 0 && ctx.data) {
            setClientLabel(ctx.data.client_label);
            setDeviceLabel(ctx.data.device_label);
          } else if (ctx.rc !== 0) {
            setErr(ctx.message || "授权上下文无效，请从客户端重新发起登录。");
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  async function onConfirm() {
    if (!state || state.length < 8) {
      setErr("无效的 state");
      return;
    }
    setErr(null);
    const res = await postJson<{ callback_uri: string; state: string }>("/auth/consent/confirm", {
      state,
    });
    if (res.rc !== 0 || !res.data?.callback_uri) {
      setErr(res.message || "授权失败");
      return;
    }
    navigate("/success", { state: { callbackUri: res.data.callback_uri } });
  }

  async function onCancel() {
    await postJson("/auth/consent/cancel", { state });
    navigate("/cancelled");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-300">
        加载中…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center">
        <p className="text-red-400">{err || "未登录"}</p>
        <button
          type="button"
          className="rounded-lg bg-white/10 px-4 py-2 text-white"
          onClick={() => navigate({ pathname: "/login", search: `?state=${encodeURIComponent(state)}` })}
        >
          去登录
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-md">
        <p className="text-center text-sm text-slate-300">
          正在尝试登录 <span className="font-semibold text-white">{clientLabel}</span>…
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-700">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">
                {(user.display_name || user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-lg font-medium text-white">{user.display_name || user.email}</p>
          <p className="text-sm text-slate-400">{user.email}</p>
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-amber-200/90">
          请确保这是您本人在设备 <span className="font-semibold text-amber-100">{deviceLabel}</span>{" "}
          上的操作
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl bg-emerald-600 py-3 text-lg font-semibold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500"
          >
            确认授权
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-white/20 py-3 text-lg font-medium text-slate-200 hover:bg-white/5"
          >
            取消
          </button>
        </div>
        {err && <p className="mt-4 text-center text-sm text-red-400">{err}</p>}
        <p className="mt-4 text-center text-[10px] text-slate-500">
          演示用：客户端/设备名可由 URL 参数传入（后续与后端绑定）。
        </p>
      </div>
    </div>
  );
}
