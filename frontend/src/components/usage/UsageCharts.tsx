import { useEffect, useMemo, useRef, useState } from "react";

import type { DayBucket } from "../../lib/usage-api";

export const EMPTY_HINT = "这段时间暂无用量记录，请调整时间范围或筛选条件";

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function daysAgo8(n: number): string {
  const d = new Date(Date.now() - n * 864e5);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- Sparkline (mirrors gateway TrendChart pattern) ---------- */
function sparkPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 6) - 3;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({ values, className }: { values: number[]; className: string }) {
  const path = sparkPath(values, 160, 38);
  return (
    <svg viewBox="0 0 160 38" className="mt-2 h-10 w-full" aria-hidden>
      <path d={path} fill="none" className={className} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- BarChart ---------- */
export function BarChart({
  data,
  labelKey,
  valueKeys,
  valueLabels,
  colors,
  maxHeight = "220px",
  emptyText = EMPTY_HINT,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKeys: string[];
  valueLabels?: string[];
  colors: string[];
  maxHeight?: string;
  emptyText?: string;
}) {
  const maxVal = useMemo(() => {
    let m = 0;
    for (const row of data) {
      let sum = 0;
      for (const k of valueKeys) sum += (row[k] as number) || 0;
      if (sum > m) m = sum;
    }
    return m || 1;
  }, [data, valueKeys]);

  if (data.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {valueLabels && valueLabels.length > 0 && (
        <div className="flex gap-3 px-1 pb-0.5">
          {valueLabels.map((lbl, ki) => (
            <span key={ki} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors[ki] }} />
              {lbl}
            </span>
          ))}
        </div>
      )}
      <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin" style={{ maxHeight }}>
        {data.map((row, i) => {
          const label = String(row[labelKey] ?? "");
          const total = valueKeys.reduce((s, k) => s + ((row[k] as number) || 0), 0);
          const calls = (row as Record<string, unknown>).calls as number | undefined;
          return (
            <div key={i} className="group flex items-center gap-2 text-[11px]">
              <span className="w-20 shrink-0 truncate text-right text-slate-500" title={label}>
                {label}
              </span>
              <div className="relative flex h-5 flex-1 overflow-hidden rounded-full bg-slate-100/90">
                {valueKeys.map((k, ki) => {
                  const val = (row[k] as number) || 0;
                  const pct = (val / maxVal) * 100;
                  return (
                    <div
                      key={k}
                      className="h-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: colors[ki] }}
                      title={`${valueLabels?.[ki] ?? k}: ${fmtNum(val)}`}
                    />
                  );
                })}
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-slate-600">
                {fmtNum(total)}
              </span>
              {calls !== undefined && (
                <span className="w-10 shrink-0 text-right tabular-nums text-slate-400 text-[10px]">
                  {fmtNum(calls)}次
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- TrendChart (single y-axis tokens, stacked input/output) ---------- */
export function TrendChart({ data, enlarged = false }: { data: DayBucket[]; enlarged?: boolean }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl bg-slate-50 text-center ${enlarged ? "h-[320px]" : "h-[260px]"}`}>
        <p className="text-xs text-slate-500">{EMPTY_HINT}</p>
        <p className="mt-0.5 px-4 text-[10px] text-slate-400">未在所选时间范围内取到按日用量打点</p>
      </div>
    );
  }

  const n = data.length;
  const padL = enlarged ? 56 : 44;
  const padR = enlarged ? 24 : 16;
  const padT = enlarged ? 28 : 20;
  const padB = enlarged ? 36 : 24;

  const pointSpacing = enlarged ? 28 : 20;
  const minIw = n * pointSpacing;
  const iw = Math.max(minIw, enlarged ? 612 : 396);
  const W = iw + padL + padR;
  const H = enlarged ? 320 : 260;
  const ih = H - padT - padB;

  const inputs = data.map((d) => d.input_tokens);
  const totals = data.map((d) => d.input_tokens + d.output_tokens);
  const maxToken = Math.max(...totals, 1);

  const tokenTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(maxToken * r));

  const xAt = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yAt = (v: number) => padT + ih - (v / maxToken) * ih;

  // Stacked areas: output band sits on top of input band.
  const inputTop = data.map((_, i) => `${xAt(i)},${yAt(inputs[i])}`);
  const totalTop = data.map((_, i) => `${xAt(i)},${yAt(totals[i])}`);
  const baseline = `${xAt(0)},${padT + ih}`;
  const baselineEnd = `${xAt(n - 1)},${padT + ih}`;

  const inputAreaD = `M ${baseline} L ${inputTop.join(" L ")} L ${baselineEnd} Z`;
  const outputAreaD = `M ${inputTop[0]} L ${totalTop.join(" L ")} L ${xAt(n - 1)},${yAt(inputs[n - 1])} L ${inputTop.join(" L ").split(" L ").reverse().join(" L ")} Z`;

  const labelEvery = enlarged ? (n <= 15 ? 1 : Math.ceil(n / 12)) : (n <= 8 ? 1 : Math.ceil(n / 6));
  const fontSize = enlarged ? "11px" : "9px";
  const axisFont = enlarged ? "10px" : "8px";

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xAt(i) - mouseX);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    setHoverIdx(closest);
  };

  return (
    <div className="overflow-x-auto w-full scrollbar-thin select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: `${W}px`, height: `${H}px`, minWidth: "100%" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`usageInput${enlarged ? "L" : "S"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id={`usageOutput${enlarged ? "L" : "S"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* grid lines */}
        {tokenTicks.map((_, ti) => {
          const y = padT + ih - (ti / 4) * ih;
          return <line key={`g${ti}`} x1={padL} y1={y} x2={padL + iw} y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3 3" />;
        })}

        {/* left Y axis labels (tokens only - single axis) */}
        {tokenTicks.map((v, ti) => {
          const y = padT + ih - (ti / 4) * ih;
          return (
            <text key={`yt${ti}`} x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-500" style={{ fontSize: axisFont }}>
              {fmtNum(v)}
            </text>
          );
        })}

        {/* stacked areas: input first (full band), then output on top */}
        <path d={inputAreaD} fill={`url(#usageInput${enlarged ? "L" : "S"})`} />
        <path d={outputAreaD} fill={`url(#usageOutput${enlarged ? "L" : "S"})`} />
        {/* top stroke (total) */}
        <polyline points={totalTop.join(" ")} fill="none" stroke="#8b5cf6" strokeWidth={enlarged ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />
        {/* input stroke */}
        <polyline points={inputTop.join(" ")} fill="none" stroke="#0ea5e9" strokeWidth={enlarged ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />

        {/* data point dots */}
        {data.map((_, i) => {
          const x = xAt(i);
          const yt = yAt(totals[i]);
          const yi = yAt(inputs[i]);
          const show = hoverIdx === i || (n <= 14 && enlarged);
          return show ? (
            <g key={`dot${i}`}>
              <circle cx={x} cy={yt} r={enlarged ? 3 : 2.5} fill="#8b5cf6" stroke="white" strokeWidth="1.5" />
              <circle cx={x} cy={yi} r={enlarged ? 3 : 2.5} fill="#0ea5e9" stroke="white" strokeWidth="1.5" />
            </g>
          ) : null;
        })}

        {/* hover tooltip */}
        {hoverIdx !== null && (
          <>
            <line x1={xAt(hoverIdx)} y1={padT} x2={xAt(hoverIdx)} y2={padT + ih} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2 2" />
            <rect x={xAt(hoverIdx) - (enlarged ? 78 : 62)} y={padT - (enlarged ? 6 : 2)} width={enlarged ? 156 : 124} height={enlarged ? 76 : 60} rx="6" fill="white" fillOpacity="0.96" stroke="#e2e8f0" strokeWidth="0.5" />
            <text x={xAt(hoverIdx)} y={padT + (enlarged ? 10 : 10)} textAnchor="middle" className="fill-slate-700 font-medium" style={{ fontSize: enlarged ? "11px" : "9px" }}>
              {data[hoverIdx].date.slice(5)}
            </text>
            <text x={xAt(hoverIdx)} y={padT + (enlarged ? 24 : 21)} textAnchor="middle" className="fill-sky-600" style={{ fontSize: enlarged ? "10px" : "8px" }}>
              输入: {fmtNum(data[hoverIdx].input_tokens)}
            </text>
            <text x={xAt(hoverIdx)} y={padT + (enlarged ? 37 : 31)} textAnchor="middle" className="fill-violet-600" style={{ fontSize: enlarged ? "10px" : "8px" }}>
              输出: {fmtNum(data[hoverIdx].output_tokens)}
            </text>
            <text x={xAt(hoverIdx)} y={padT + (enlarged ? 50 : 41)} textAnchor="middle" className="fill-slate-600" style={{ fontSize: enlarged ? "10px" : "8px" }}>
              总 Tokens: {fmtNum(totals[hoverIdx])}
            </text>
            <text x={xAt(hoverIdx)} y={padT + (enlarged ? 63 : 51)} textAnchor="middle" className="fill-amber-600" style={{ fontSize: enlarged ? "10px" : "8px" }}>
              调用: {data[hoverIdx].calls} 次
            </text>
          </>
        )}

        {/* X axis labels */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          return (
            <text key={d.date + i} x={xAt(i)} y={H - (enlarged ? 8 : 4)} textAnchor="middle" className="fill-slate-400" style={{ fontSize }}>
              {d.date.slice(5)}
            </text>
          );
        })}

        {/* legend */}
        <circle cx={padL} cy={padT - 8} r="4" fill="#0ea5e9" />
        <text x={padL + 8} y={padT - 5} className="fill-sky-600" style={{ fontSize }}>输入</text>
        <circle cx={padL + (enlarged ? 56 : 44)} cy={padT - 8} r="4" fill="#8b5cf6" />
        <text x={padL + (enlarged ? 64 : 52)} y={padT - 5} className="fill-violet-600" style={{ fontSize }}>输出</text>
      </svg>
    </div>
  );
}

/* ---------- Side panels (gateway SuccessPanel/TokenPanel pattern) ---------- */
export function CallsPanel({ data }: { data: DayBucket[] }) {
  const total = data.reduce((s, d) => s + d.calls, 0);
  const values = data.map((d) => d.calls);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">调用次数</div>
      <div className="mt-1 text-3xl font-black tracking-tight text-sky-700">{fmtNum(total)}</div>
      <div className="mt-1 text-[11px] text-slate-500">所选范围内合计</div>
      <Sparkline values={values} className="stroke-sky-500" />
    </div>
  );
}

export function AvgTokensPanel({ data }: { data: DayBucket[] }) {
  const totalTokens = data.reduce((s, d) => s + d.input_tokens + d.output_tokens, 0);
  const avg = data.length > 0 ? totalTokens / data.length : 0;
  const values = data.map((d) => d.input_tokens + d.output_tokens);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">日均 Tokens</div>
      <div className="mt-1 text-3xl font-black tracking-tight text-violet-700">{fmtNum(Math.round(avg))}</div>
      <div className="mt-1 text-[11px] text-slate-500">合计 {fmtNum(totalTokens)} · {data.length} 天</div>
      <Sparkline values={values} className="stroke-violet-500" />
    </div>
  );
}

/* ---------- ChartModal ---------- */
export function ChartModal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- KpiTile (gateway KpiBar style) ---------- */
export type KpiEmphasis = "default" | "sky" | "violet" | "amber" | "emerald";

export function KpiTile({
  label,
  value,
  sub,
  emphasis = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: KpiEmphasis;
}) {
  const toneClass: Record<KpiEmphasis, { card: string; label: string; value: string; sub: string }> = {
    default: { card: "border-slate-200 bg-white", label: "text-slate-500", value: "text-slate-900", sub: "text-slate-400" },
    sky: { card: "border-sky-200 bg-sky-50/50", label: "text-sky-600", value: "text-sky-700", sub: "text-sky-600/70" },
    violet: { card: "border-violet-200 bg-violet-50/50", label: "text-violet-600", value: "text-violet-700", sub: "text-violet-600/70" },
    amber: { card: "border-amber-200 bg-amber-50/60", label: "text-amber-600", value: "text-amber-700", sub: "text-amber-600/75" },
    emerald: { card: "border-emerald-200 bg-emerald-50/60", label: "text-emerald-600", value: "text-emerald-700", sub: "text-emerald-600/70" },
  };
  const classes = toneClass[emphasis];
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${classes.card}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${classes.label}`}>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${classes.value}`}>
        {value}
      </div>
      {sub ? <div className={`mt-0.5 text-[11px] ${classes.sub}`}>{sub}</div> : null}
    </div>
  );
}

/* ---------- MultiSelect ---------- */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (s: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className={`flex min-w-[140px] cursor-pointer flex-wrap items-center gap-1 rounded-full border-0 bg-white px-3 py-1.5 text-xs shadow-sm ring-1 transition ${
          open ? "ring-2 ring-sky-300" : "ring-slate-200"
        }`}
      >
        {selected.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700"
            >
              <span className="max-w-[80px] truncate">{v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((x) => x !== v));
                }}
                className="ml-0.5 text-sky-400 hover:text-sky-600"
              >
                ×
              </button>
            </span>
          ))
        )}
        {selected.length > 0 && selected.length < options.length && (
          <span className="text-[10px] text-slate-400">+{options.length - selected.length}</span>
        )}
        <span className="ml-auto text-[10px] text-slate-300">▼</span>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-300"
          />
          {options.length > 5 && (
            <div className="mb-1 flex gap-2 border-b border-slate-100 pb-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-[10px] text-sky-500 hover:text-sky-700"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                取消全选
              </button>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-slate-400">无匹配选项</p>
            ) : (
              filtered.map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 hover:bg-sky-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function tryPrettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
