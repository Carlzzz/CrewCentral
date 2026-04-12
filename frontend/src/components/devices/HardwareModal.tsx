import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  hardware: Record<string, unknown> | null;
};

export default function HardwareModal({ open, onClose, title, hardware }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hw-modal-title"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="hw-modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          硬件快照来自客户端上报；展示为省/市级地理信息，不含精确经纬度用于非安全用途。
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 border border-slate-100 p-4 text-xs text-slate-700 font-mono shadow-inner">
          {hardware ? JSON.stringify(hardware, null, 2) : "（无硬件快照）"}
        </pre>
      </div>
    </div>
  );
}
