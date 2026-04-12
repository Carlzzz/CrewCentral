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
      <label className="text-xs text-slate-400">技能参数配置（JSON）</label>
      <textarea
        value={text}
        onChange={(e) => validateAndEmit(e.target.value)}
        className="min-h-[220px] w-full rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-xs text-emerald-200"
      />
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  );
}
