# Quickstart: 003-skill-hub

**Date**: 2026-04-07

## 目标

在本地快速跑通「技能大厅管理 -> 权限绑定 -> 客户端清单拉取 -> 下载凭据申请」主链路。

## 前置条件

- 已完成 `auth-login` 并可使用管理员 Session 登录后台。  
- 可访问设备属性（平台）信息（来自 `device-manage`）。  
- 已准备示例技能包（含元数据与可校验 hash）。  

## 建议流程

1. 启动后端与前端，确认 Base Path（例如 `/woicrew`）一致。  
2. 管理员访问 `{BASE_PATH}/admin/skills`，上传技能包。  
3. 在技能详情确认版本信息与更新日志。  
4. 进入 `{BASE_PATH}/admin/skills/assignments`，为用户/用户组绑定技能并填写 JSON 参数。  
5. 用客户端 Bearer 请求：
   - `GET {BASE_PATH}/api/v1/skills/manifest?device_uuid=...&platform=windows`
   - `POST {BASE_PATH}/api/v1/skills/{slug}/download-token`
6. 客户端按返回信息下载并做 hash 校验，校验通过后替换本地版本。

## 本地 curl 样例

```bash
# 1) 拉取可用技能清单
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "http://127.0.0.1:8000/woicrew/api/v1/skills/manifest?device_uuid=dev-001&platform=windows"

# 2) 申请短效下载凭据
curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"device_uuid":"dev-001","version":"1.2.0"}' \
  "http://127.0.0.1:8000/woicrew/api/v1/skills/demo-skill/download-token"
```

## Base Path 四一致检查

- Vite `base` 与 Router `basename` 使用同一 `BASE_PATH`。  
- FastAPI 将技能相关路由挂载在同一 `BASE_PATH` 前缀。  
- Session Cookie `Path` 与 `BASE_PATH` 一致。  
- Nginx `location` 与前后端代理路径保持一致。

## 常见联调检查

- 未授权用户/设备不应拿到技能清单项。  
- 过期下载 token 必须返回拒绝响应。  
- 客户端 hash 校验失败时不得加载新包。  
- 分类导航与卡片筛选结果一致。  

## 安全注意事项

- 上传链路必须校验 zip 合法性与 `SKILL.md` frontmatter 必填字段。  
- 必须拒绝 zip 内路径穿越条目（绝对路径或 `..`）。  
- 下载 token 采用短时效签名并绑定请求主体，禁止复用。  
- 日志中不得打印 token 明文、密钥和上传文件内容。  

## 本次实现验证记录

- 后端静态检查：`ruff check app` ✅  
- 后端导入烟测：`python -c "from app.main import app"` ✅  
- 前端构建检查：`npm run build` ✅  
- 合同对齐检查：已补充 `GET /api/v1/skills/download` 与 `download-token` 的 `platform` 查询参数 ✅  
