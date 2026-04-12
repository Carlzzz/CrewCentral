import { useCallback, useRef, useState } from "react";

import { uploadSkillPackage } from "../../lib/skills-api";

type Props = {
  onUploaded: () => void;
};

function isZipFile(f: File): boolean {
  const n = f.name.toLowerCase();
  return n.endsWith(".zip") && (f.type === "application/zip" || f.type === "application/x-zip-compressed" || f.type === "");
}

export default function SkillPackageUploadZone({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!isZipFile(file)) {
        setMessage("仅支持 .zip 格式的技能包");
        return;
      }
      setBusy(true);
      setMessage(null);
      const res = await uploadSkillPackage(file);
      setBusy(false);
      setMessage(res.message || (res.rc === 0 ? "上传成功" : "上传失败"));
      if (res.rc === 0) onUploaded();
    },
    [onUploaded],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start">
      <div>
        <p className="text-sm text-slate-600">
          拖入包含 SKILL.md（带 YAML frontmatter 元数据）的 .zip 文件。
        </p>
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
          className={
            "mt-6 flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-12 transition " +
            (dragOver ? "border-sky-400 bg-sky-50/50" : "border-slate-200 hover:border-slate-300")
          }
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="mt-4 text-center text-sm font-medium text-slate-800">拖放技能包到此处</p>
          <p className="mt-1 text-center text-xs text-slate-500">或点击选择文件 — 仅限 .zip 格式</p>
          <button
            type="button"
            className="mt-6 rounded-full bg-slate-900 px-8 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "上传中…" : "选择文件"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            aria-label="选择 zip 技能包"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-amber-500" aria-hidden>
            ℹ
          </span>
          Bundle 要求
        </h3>
        <ul className="mt-4 space-y-4 text-sm text-slate-600">
          <li>
            <p className="font-medium text-slate-800">必须为 .zip 文件</p>
            <p className="mt-1 text-xs leading-relaxed">上传包必须为包含技能文件的 ZIP 压缩包。</p>
          </li>
          <li>
            <p className="font-medium text-slate-800">SKILL.md 位置</p>
            <p className="mt-1 text-xs leading-relaxed">
              须为 <code className="rounded bg-slate-100 px-1">SKILL.md</code>（大小写一致），位于 ZIP 根目录，或一层子目录内（如{" "}
              <code className="rounded bg-slate-100 px-1">my-skill/SKILL.md</code>）。
            </p>
          </li>
          <li>
            <p className="font-medium text-slate-800">YAML Frontmatter</p>
            <p className="mt-1 text-xs leading-relaxed">
              <code className="rounded bg-slate-100 px-1">SKILL.md</code> 须包含 YAML frontmatter，至少包含{" "}
              <code className="rounded bg-slate-100 px-1">name</code>、
              <code className="rounded bg-slate-100 px-1">version</code>、
              <code className="rounded bg-slate-100 px-1">publisher</code>（或 <code className="rounded bg-slate-100 px-1">author</code>
              ）；<code className="rounded bg-slate-100 px-1">slug</code> 与{" "}
              <code className="rounded bg-slate-100 px-1">description</code> 可不写（未写 slug 时由 name 自动生成标识）。
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
{`---
name: "My Awesome Skill"
version: "1.0.0"
publisher: "Acme Corp"
# slug 与 description 可选
---`}
            </pre>
          </li>
        </ul>
      </aside>
    </div>
  );
}
