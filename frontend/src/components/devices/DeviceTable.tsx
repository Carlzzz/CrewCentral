import { useMemo, useState } from "react";
import type { DeviceRow } from "../../lib/devices-api";
import {
  blockDevice,
  fetchDeviceLogs,
  kickDevice,
  rebootDevice,
} from "../../lib/devices-api";
import HardwareModal from "./HardwareModal";
import StatusPing from "./StatusPing";

type Props = {
  items: DeviceRow[];
  loading: boolean;
  page: number;
  pages: number;
  onPageChange: (p: number) => void;
  onMutate?: () => void;
};

function mapStatus(s: string): "online" | "offline" | "blocked" | "error" | "anomaly" {
  if (s === "online") return "online";
  if (s === "blocked") return "blocked";
  if (s === "error") return "error";
  if (s === "anomaly") return "anomaly";
  return "offline";
}

export default function DeviceTable({ items, loading, page, pages, onPageChange, onMutate }: Props) {
  const [hw, setHw] = useState<{ row: DeviceRow } | null>(null);
  const [logText, setLogText] = useState<string | null>(null);

  const canPrev = useMemo(() => page > 1, [page]);
  const canNext = useMemo(() => page < pages, [page, pages]);

  async function onKick(id: string) {
    if (!confirm("确认强制下线该设备？")) return;
    const res = await kickDevice(id);
    alert(res.rc === 0 ? res.message : res.message || "失败");
    if (res.rc === 0) onMutate?.();
  }

  async function onBlock(id: string) {
    if (!confirm("确认封禁该设备？")) return;
    const res = await blockDevice(id);
    alert(res.rc === 0 ? res.message : res.message || "失败");
    if (res.rc === 0) onMutate?.();
  }

  async function onReboot(id: string) {
    if (!confirm("确认下发远程重启？")) return;
    const res = await rebootDevice(id);
    alert(res.rc === 0 ? res.message : res.message || "失败");
    if (res.rc === 0) onMutate?.();
  }

  async function onLogs(id: string) {
    const res = await fetchDeviceLogs(id, 30);
    if (res.rc !== 0 || !res.data) {
      alert(res.message || "加载日志失败");
      return;
    }
    setLogText(
      res.data.map((l) => `${l.created_at} [${l.level}] ${l.message}`).join("\n"),
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">设备 / 认证用户</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3 font-mono">MAC</th>
              <th className="px-4 py-3">技能</th>
              <th className="px-4 py-3">最后活跃</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            )}
            {!loading &&
              items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 align-top pt-4">
                    <StatusPing status={mapStatus(row.status)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-400 mb-1">{row.device_uuid}</div>
                    <div className="font-medium text-slate-900">{row.name || "—"}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium">{row.owner_display_name || row.owner_user_id}</span>
                      {row.owner_email && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>{row.owner_email}</span>
                        </>
                      )}
                    </div>
                    {(row.client_version || row.os_version) && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {row.client_version && <span className="rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200">客户端 {row.client_version}</span>}
                        {row.os_version && <span className="rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200">{row.os_version}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top pt-4">
                    <button
                      type="button"
                      className="text-left font-medium text-sky-600 hover:text-sky-700 hover:underline"
                      onClick={() => setHw({ row })}
                    >
                      {row.last_ip || "—"}
                    </button>
                    <div className="mt-1 text-xs text-slate-500">{row.last_ip_geo || ""}</div>
                  </td>
                  <td className="px-4 py-3 align-top pt-4 font-mono text-xs text-slate-500">
                    {row.mac_address || "—"}
                  </td>
                  <td className="px-4 py-3 align-top pt-4">
                    {row.current_skill_slug ? (
                      <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 border border-sky-100">
                        {row.current_skill_slug}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top pt-4 font-mono text-xs text-slate-500">
                    {row.last_seen_at ? row.last_seen_at.substring(0, 19).replace("T", " ") : "从未"}
                  </td>
                  <td className="px-4 py-3 align-top pt-3 text-right">
                    <div className="flex justify-end flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onReboot(row.id)}
                        disabled={mapStatus(row.status) !== "online"}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 hover:text-amber-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-50 disabled:hover:text-amber-700 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                        title="下发指令让设备重启"
                      >
                        重启
                      </button>
                      <button
                        type="button"
                        onClick={() => onKick(row.id)}
                        disabled={mapStatus(row.status) !== "online"}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-50 disabled:hover:text-red-600 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                        title="强制设备退出登录"
                      >
                        断开
                      </button>
                      <button
                        type="button"
                        onClick={() => onBlock(row.id)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        封禁
                      </button>
                      <button
                        type="button"
                        onClick={() => onLogs(row.id)}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        日志
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        <span>
          第 <span className="font-medium text-slate-900">{page}</span> / <span className="font-medium text-slate-900">{pages}</span> 页
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-white border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            className="rounded-md bg-white border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      <HardwareModal
        open={hw !== null}
        onClose={() => setHw(null)}
        title={hw ? `${hw.row.last_ip || "IP"} · 硬件` : ""}
        hardware={hw?.row.hardware_snapshot ?? null}
      />

      {logText !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[70vh] w-full max-w-2xl overflow-auto rounded-xl border border-white/10 bg-slate-900 p-4">
            <div className="mb-2 flex justify-between">
              <span className="font-medium text-slate-100">设备日志</span>
              <button
                type="button"
                className="text-sm text-slate-400"
                onClick={() => setLogText(null)}
              >
                关闭
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-xs text-slate-300">{logText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
