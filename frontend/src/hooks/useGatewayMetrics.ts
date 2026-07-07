import { useEffect, useRef, useState } from "react";
import { fetchGatewayMetrics, type GatewayMetrics } from "../lib/gateway-api";

export type GatewayMetricsState = {
  data: GatewayMetrics | null;
  error: string | null;
  lastUpdated: number | null;
  loading: boolean;
};

const POLL_MS = 3000;

export function useGatewayMetrics(): GatewayMetricsState {
  const [state, setState] = useState<GatewayMetricsState>({ data: null, error: null, lastUpdated: null, loading: true });
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (inFlight.current) return;          // overlap protection
      inFlight.current = true;
      try {
        const res = await fetchGatewayMetrics();
        if (cancelled) return;
        if (res.rc === 0 && res.data) {
          setState({ data: res.data, error: null, lastUpdated: Date.now(), loading: false });
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
