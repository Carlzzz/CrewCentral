import { useSearchParams } from "react-router-dom";

export default function AuthCancelledPage() {
  const [params] = useSearchParams();
  const err = params.get("error");
  const desc = params.get("error_description");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_70%_20%,#e0f2fe,transparent_40%),linear-gradient(to_bottom,#fff,#f0f9ff)] p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">已取消授权</h1>
      <p className="mt-3 max-w-md text-sm text-slate-500">
        您未确认授权，或从企业登录流程返回。请关闭此页并返回桌面客户端重试。
      </p>
      {(err || desc) && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {err}
          {desc ? ` — ${desc}` : ""}
        </p>
      )}
      <p className="mt-8 text-xs text-slate-400">CrewCentral 中控</p>
    </div>
  );
}
