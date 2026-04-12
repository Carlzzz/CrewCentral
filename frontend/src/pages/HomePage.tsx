import { Link } from "react-router-dom";

import TopNavBar from "../components/layout/TopNavBar";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_70%_20%,#e0f2fe,transparent_40%),linear-gradient(to_bottom,#fff,#f0f9ff)]">
      <TopNavBar />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <section>
          <p className="inline-block rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            V1.0 内测可用
          </p>
          <h1 className="mt-5 text-5xl font-bold tracking-tight text-slate-900">光羿 Crew</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            全天候、全场景智能工作助手。帮助团队快速把任务拆解、执行和交付，减少重复操作和协作摩擦。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/download"
              className="rounded-full bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm"
            >
              下载光羿Crew
            </Link>
            <Link
              to="/admin/skills"
              className="rounded-full border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 hover:bg-white"
            >
              查看技能
            </Link>
          </div>
        </section>
        <section className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">智能体示例</p>
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
            我是光羿 Crew 智能体。你可以直接告诉我目标，我会帮你拆解步骤、调用技能并执行。
          </div>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 text-xs text-slate-500">
            [context] 你是一个高效的任务执行助手...
          </div>
        </section>
      </main>
    </div>
  );
}
