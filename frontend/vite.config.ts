import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/woicrew/";
  /** 与 backend `BASE_PATH` 一致，不含尾部 / */
  const baseNoSlash = base.replace(/\/$/, "") || "/woicrew";
  return {
    plugins: [react()],
    base,
    server: {
      port: 5173,
      /** 监听 0.0.0.0，避免仅绑定 ::1 时浏览器用 127.0.0.1 连不上 */
      host: true,
      strictPort: false,
      // 只代理 JSON API 与浏览器 OAuth 回调，不要把整段 /woicrew 代理出去，
      // 否则 GET /woicrew/docs 会打到 FastAPI，得到 404 或连接异常。
      proxy: {
        [`${baseNoSlash}/api`]: {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        [`${baseNoSlash}/auth`]: {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        /** Skill Hub 契约：index.json + 公开 ZIP（见 docs/skill-hub-api-contract.md） */
        [`${baseNoSlash}/index.json`]: {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        [`${baseNoSlash}/skills/packages`]: {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
