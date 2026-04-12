import type { ChangelogEntry } from "../../lib/releases-api";

type Props = {
  entries: ChangelogEntry[];
  releaseNotes: string;
};

function Badge({ kind }: { kind: "new" | "fix" }) {
  const label = kind === "new" ? "New" : "Fix";
  const cls =
    kind === "new"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : "bg-amber-100 text-amber-700 ring-amber-200";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{label}</span>
  );
}

export default function ChangelogPanel({ entries, releaseNotes }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 className="text-lg font-semibold text-slate-900">更新说明</h2>
      {releaseNotes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{releaseNotes}</p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">暂无说明</p>
      )}
      {entries.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {entries.map((e, i) => (
            <li key={`${i}-${e.text.slice(0, 16)}`} className="flex gap-2 text-sm text-slate-700">
              <Badge kind={e.type} />
              <span className="flex-1 whitespace-pre-wrap break-words">{e.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
