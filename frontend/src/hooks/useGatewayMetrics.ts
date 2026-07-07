import { useEffect, useRef, useState } from "react";
import { fetchGatewayMetrics, type GatewayMetrics } from "../lib/gateway-api";

export type GatewayMetricsState = {
  data: GatewayMetrics | null;
  error: string | null;
  lastUpdated: number | null;
  loading: boolean;
  history: HistorySample[];
};

/**
 * One sample of the rolling client-side history buffer.
 * The /metrics endpoint only returns current-window aggregates, so the hook
 * keeps the last 120 samples (~6 min at 3s poll) for the trend + token-rate charts.
 */
export type HistorySample = {
  ts: number;
  /** totals.last1h.count at sample time */
  count: number;
  /** totals.last5m.successRate (0..1) at sample time */
  successRate: number;
  /** totals.last1m.inputTokens at sample time */
  inputTokens: number;
  /** totals.last1m.outputTokens at sample time */
  outputTokens: number;
};

const POLL_MS = 3000;
const HISTORY_LIMIT = 120;

export function useGatewayMetrics(): GatewayMetricsState {
  const [state, setState] = useState<GatewayMetricsState>({
    data: null,
    error: null,
    lastUpdated: null,
    loading: true,
    history: [],
  });
  const inFlight = useRef(false);
  const historyRef = useRef<HistorySample[]>([]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (inFlight.current) return;          // overlap protection
      inFlight.current = true;
      try {
        const res = await fetchGatewayMetrics();
        if (cancelled) return;
        if (res.rc === 0 && res.data) {
          const d = res.data;
          const sample: HistorySample = {
            ts: Date.now(),
            count: d.totals.last1h.count ?? 0,
            successRate: d.totals.last5m.successRate ?? 0,
            inputTokens: d.totals.last1m.inputTokens ?? 0,
            outputTokens: d.totals.last1m.outputTokens ?? 0,
          };
          const next = [...historyRef.current, sample];
          if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
          historyRef.current = next;
          setState({
            data: d,
            error: null,
            lastUpdated: Date.now(),
            loading: false,
            history: next,
          });
        } else {
          setState((s) => ({ ...s, error: res.message || "加载失败", loading: false }));
        }
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: "无法连接服务器", loading: false }));
      } finally {
        inFlight.current = false;
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return state;
}
