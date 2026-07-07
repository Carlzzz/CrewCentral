import { useGatewayMetrics } from "../../hooks/useGatewayMetrics";
import KpiBar from "../../components/gateway/KpiBar";
import ProviderCard from "../../components/gateway/ProviderCard";
import QuotaProviderHeroCard from "../../components/gateway/QuotaProviderHeroCard";
import TrendChart from "../../components/gateway/TrendChart";
import { splitGatewayProviders } from "../../components/gateway/gateway-ui";

export default function GatewayDashboardPage() {
  const { data, error, lastUpdated, loading, history } = useGatewayMetrics();
  const split = data ? splitGatewayProviders(data.providers) : { heroProviders: [], otherProviders: [] };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">网关监控</h1>
            <p className="mt-1 text-sm text-slate-500">CrewProxy 实时调用 · 模型配额 · token 池状态</p>
          </div>
          <span className="text-xs text-slate-400">
            {data ? `刷新于 ${new Date(lastUpdated ?? Date.now()).toLocaleTimeString()}` : loading ? "加载中…" : ""}
          </span>
        </div>

        {data ? (
          <>
            <KpiBar totals={data.totals} activeProviders={data.activeProviders} downProviders={data.downProviders} lastUpdated={lastUpdated} error={error} />

            {split.heroProviders.length > 0 ? (
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {split.heroProviders.map((provider) => (
                  <QuotaProviderHeroCard key={provider.upstreamId} provider={provider} />
                ))}
              </section>
            ) : null}

            {split.otherProviders.length > 0 ? (
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {split.otherProviders.map((provider) => (
                  <ProviderCard key={provider.upstreamId} provider={provider} />
                ))}
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <TrendChart history={history} />
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
