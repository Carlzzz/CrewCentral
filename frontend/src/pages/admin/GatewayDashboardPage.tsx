import { useGatewayMetrics } from "../../hooks/useGatewayMetrics";
import KpiBar from "../../components/gateway/KpiBar";
import ProviderCard from "../../components/gateway/ProviderCard";
import PoolLoadChart from "../../components/gateway/PoolLoadChart";
import QuotaGrid from "../../components/gateway/QuotaGrid";
import TrendChart from "../../components/gateway/TrendChart";
import TokenRateChart from "../../components/gateway/TokenRateChart";

export default function GatewayDashboardPage() {
  const { data, error, lastUpdated, loading, history } = useGatewayMetrics();
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">网关监控</h1>
            <p className="text-sm text-slate-500 mt-1">CrewProxy 实时调用 · 池子负载 · 配额</p>
          </div>
          <span className="text-xs text-slate-400">{data ? `刷新于 ${new Date(lastUpdated ?? Date.now()).toLocaleTimeString()}` : (loading ? "加载中…" : "")}</span>
        </div>
        {data ? (
          <>
            <KpiBar totals={data.totals} activeProviders={data.activeProviders} downProviders={data.downProviders} lastUpdated={lastUpdated} error={error} />
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.providers.map((p) => <ProviderCard key={p.upstreamId} provider={p} />)}
            </section>
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <PoolLoadChart providers={data.providers} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <QuotaGrid providers={data.providers} />
            </section>
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                <TrendChart history={history} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                <TokenRateChart history={history} />
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            {error ? `加载失败：${error}` : "加载中…"}
          </div>
        )}
      </div>
    </div>
  );
}
