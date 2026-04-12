import { useSearchParams } from "react-router-dom";

export default function AuthCancelledPage() {
  const [params] = useSearchParams();
  const err = params.get("error");
  const desc = params.get("error_description");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
      <h1 className="text-xl font-semibold text-white">已取消授权</h1>
      <p className="mt-3 max-w-md text-sm text-slate-400">
        您未确认授权，或从企业登录流程返回。请关闭此页并返回桌面客户端重试。
      </p>
      {(err || desc) && (
        <p className="mt-4 text-xs text-amber-200/90">
          {err}
          {desc ? ` — ${desc}` : ""}
        </p>
      )}
      <p className="mt-8 text-xs text-slate-500">CrewCentral 中控</p>
    </div>
  );
}
