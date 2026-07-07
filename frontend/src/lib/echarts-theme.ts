import * as echarts from "echarts";

echarts.registerTheme("crew-light", {
  color: ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e", "#4f46e5", "#f97316"],
  backgroundColor: "transparent",
  textStyle: { color: "#475569", fontFamily: "inherit" },
  title: { textStyle: { color: "#0f172a" }, subtextStyle: { color: "#64748b" } },
  legend: { textStyle: { color: "#475569" } },
  tooltip: {
    backgroundColor: "rgba(15,23,42,0.92)",
    borderWidth: 0,
    textStyle: { color: "#f8fafc" },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#e2e8f0" } },
    axisTick: { lineStyle: { color: "#e2e8f0" } },
    axisLabel: { color: "#64748b" },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#e2e8f0" } },
    axisLabel: { color: "#64748b" },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
});

export { echarts };
