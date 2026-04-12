import { useNavigate } from "react-router-dom";

import SkillPackageUploadZone from "../../components/skills/SkillPackageUploadZone";

export default function SkillUploadPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100/80 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">上传技能包</h1>
          <p className="text-sm text-slate-500">仅支持 .zip；ZIP 内需包含 SKILL.md（YAML frontmatter）</p>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SkillPackageUploadZone
            onUploaded={() => {
              navigate("/admin/skills");
            }}
          />
        </section>
      </div>
    </div>
  );
}
