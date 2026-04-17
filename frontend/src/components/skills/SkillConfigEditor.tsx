import { useEffect, useState } from "react";

type Props = {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
};

export default function SkillConfigEditor({ value, onChange }: Props) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  function validateAndEmit(next: string) {
    setText(next);
    try {
      const parsed = JSON.parse(next);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setErr("必须是 JSON 对象");
        return;
      }
      setErr(null);
      onChange(parsed as Record<string, unknown>);
    } catch {
      setErr("JSON 格式错误");
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">技能参数配置（JSON）</label>
      <textarea
        value={text}
        onChange={(e) => validateAndEmit(e.target.value)}
        className="min-h-[220px] w-full rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all custom-scrollbar shadow-inner"
        placeholder="{}"
      />
      {err && <p className="text-xs text-rose-500">{err}</p>}
    </div>
  );
}
