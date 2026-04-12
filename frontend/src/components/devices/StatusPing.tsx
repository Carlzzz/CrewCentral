type Props = { status: "online" | "offline" | "blocked" | "error" | "anomaly" };

export default function StatusPing({ status }: Props) {
  const label =
    status === "online"
      ? "在线"
      : status === "offline"
        ? "离线"
        : status === "blocked"
          ? "封禁"
          : "异常";

  const dotClass =
    status === "online"
      ? "bg-emerald-400 motion-safe:animate-ping"
      : status === "offline"
        ? "bg-slate-400"
        : status === "blocked"
          ? "bg-rose-500"
          : "bg-amber-400";

  return (
    <span className="inline-flex items-center gap-2" aria-label={`设备状态：${label}`}>
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass}`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${status === "online" ? "bg-emerald-400" : status === "offline" ? "bg-slate-400" : status === "blocked" ? "bg-rose-500" : "bg-amber-400"}`}
        />
      </span>
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </span>
  );
}
