import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatCards from "../../components/devices/StatCards";
import DeviceTable from "../../components/devices/DeviceTable";
import type { DeviceRow, DeviceStats } from "../../lib/devices-api";
import { fetchDeviceList, fetchDeviceStats } from "../../lib/devices-api";
import { fetchSessionUserinfo } from "../../lib/api";

export default function DeviceManagePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [items, setItems] = useState<DeviceRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusDraft, setStatusDraft] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [ipDraft, setIpDraft] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [ip, setIp] = useState("");
  const [ready, setReady] = useState(false);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      const [s, l] = await Promise.all([
        fetchDeviceStats(),
        fetchDeviceList({
          page: p,
          page_size: 20,
          status: status || undefined,
          user: userId || undefined,
          ip: ip || undefined,
        }),
      ]);
      if (s.rc === 0 && s.data) setStats(s.data);
      if (l.rc === 0 && l.data) {
        setItems(l.data.items);
        setPages(l.data.pages);
      }
      setLoading(false);
    },
    [status, userId, ip],
  );

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUserinfo();
      if (!u || !u.is_admin) {
        navigate("/login", { replace: true });
        return;
      }
      setReady(true);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    void load(page);
  }, [ready, page, load]);

  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => void load(page), 30_000);
    return () => clearInterval(timer);
  }, [ready, page, load]);

  function applyFilters() {
    setStatus(statusDraft);
    setUserId(userDraft);
    setIp(ipDraft);
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">设备管理</h1>
          <p className="text-sm text-slate-500">统计、筛选与行级管控（Session 管理员）</p>
        </div>

        <StatCards stats={stats} />

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-end">
          <label className="flex flex-col text-xs text-slate-500">
            状态
            <select
              className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
            >
              <option value="">全部</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
              <option value="blocked">封禁</option>
              <option value="error">异常状态</option>
              <option value="anomaly">异常（综合）</option>
            </select>
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            用户
            <input
              className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={userDraft}
              onChange={(e) => setUserDraft(e.target.value)}
              placeholder="用户名 / 邮箱 / 姓名"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            IP 模糊
            <input
              className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={ipDraft}
              onChange={(e) => setIpDraft(e.target.value)}
              placeholder="124."
            />
          </label>
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            onClick={() => applyFilters()}
          >
            查询
          </button>
        </div>

        <DeviceTable
          items={items}
          loading={loading}
          page={page}
          pages={pages}
          onPageChange={setPage}
          onMutate={() => void load(page)}
        />
      </div>
    </div>
  );
}
