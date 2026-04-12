import type { DeviceStats } from "../../lib/devices-api";

type Props = { stats: DeviceStats | null };

export default function StatCards({ stats }: Props) {
  const s = stats ?? { total: 0, online: 0, offline: 0, anomaly: 0 };
  const cards = [
    { label: "总设备数", value: s.total, accent: "text-slate-900" },
    { label: "在线", value: s.online, accent: "text-emerald-600" },
    { label: "离线", value: s.offline, accent: "text-slate-500" },
    { label: "异常", value: s.anomaly, accent: "text-amber-500" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="text-xs font-medium text-slate-500">{c.label}</div>
          <div className={`mt-2 text-3xl font-bold ${c.accent}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
