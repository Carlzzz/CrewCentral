import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

type LocState = { callbackUri?: string };

export default function AuthSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const callbackUri = (location.state as LocState | null)?.callbackUri;
  const [sec, setSec] = useState(5);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!callbackUri) return;
    try {
      window.location.href = callbackUri;
    } catch {
      /* ignore */
    }
  }, [callbackUri]);

  useEffect(() => {
    if (sec <= 0) {
      navigate("/home", { replace: true });
      window.close();
      return;
    }
    const t = setInterval(() => setSec((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [sec, navigate]);

  async function copyUri() {
    if (!callbackUri) return;
    await navigator.clipboard.writeText(callbackUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function retryOpen() {
    if (callbackUri) window.location.href = callbackUri;
  }

  if (!callbackUri) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_70%_20%,#e0f2fe,transparent_40%),linear-gradient(to_bottom,#fff,#f0f9ff)] p-6 text-center">
        <p className="text-slate-600">缺少回调信息，请返回授权流程。</p>
        <button
          type="button"
          className="text-sky-600 underline hover:text-sky-500"
          onClick={() => navigate("/login")}
        >
          回到登录
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_70%_20%,#e0f2fe,transparent_40%),linear-gradient(to_bottom,#fff,#f0f9ff)] p-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-5xl text-green-600">
        ✓
      </div>
      <h1 className="text-xl font-semibold text-slate-900">授权成功</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        正在尝试打开客户端… 若未自动跳转，请使用下方按钮复制链接或重试。
      </p>
      <p className="mt-4 text-3xl font-mono text-slate-900">{sec}</p>
      <p className="text-xs text-slate-400">秒后尝试关闭窗口（部分浏览器可能禁止脚本关页）</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={copyUri}
          className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {copied ? "已复制" : "复制回调 URI"}
        </button>
        <button
          type="button"
          onClick={retryOpen}
          className="rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:from-sky-500 hover:to-blue-500"
        >
          重试打开客户端
        </button>
      </div>
      <div className="mt-6 flex flex-col gap-2 text-sm">
        <Link to="/home" className="text-sky-600 underline hover:text-sky-500">
          返回首页
        </Link>
      </div>
      <Link to="/login" className="mt-4 text-xs text-slate-400 underline hover:text-slate-500">
        回到登录页
      </Link>
    </div>
  );
}
