# UI Contract: 授权确认页与成功页（001-auth-login）

**Date**: 2026-04-07  
**Route（示例，前缀为 `BASE_PATH`）**: `/auth/consent`（授权确认）、`/auth/done` 或等价（成功/倒计时）

## 布局

- **容器**: 视口全屏居中；主内容 **单卡片**（max-width ~420–480px），垂直堆叠。
- **风格**: 背景 **Glassmorphism**（半透明 + `backdrop-blur`）；卡片圆角与轻阴影；暗色/浅色主题可二选一，须保证 WCAG AA 对比度（实现阶段用工具复核）。

## 授权确认页（Consent）必含元素

| 区域 | 内容 | 行为 |
|------|------|------|
| 状态提示 | 文案模板：`正在尝试登录 [客户端名称]...` | `client_label` 来自 AuthorizationRequest |
| 用户信息 | 已登录用户 **头像** + **邮箱** | 来自 Session 用户；无头像则占位符 |
| 安全提示 | `请确保这是您本人在设备 [Device_Name] 上的操作` | `device_label` 来自 AuthorizationRequest |
| 主操作 | **确认授权**（Primary，大尺寸全宽或显著宽度） | 提交 `POST /api/v1/auth/consent/confirm` 或表单等价 |
| 次操作 | **取消**（Secondary/Outline） | 标记请求 cancelled，返回错误码或静态说明页 |

## 成功页（授权已签发、即将回传）

- 显示 **绿色对勾**（成功图标）与简短成功文案。
- **倒计时**（建议 3–5 秒）后尝试 `window.close()`；若浏览器策略禁止关闭，则展示「您可以关闭此标签页」。
- 同时触发 **Custom URI** 打开客户端（与 spec FR-003 一致）；若失败，展示 **复制 Token** / **重试唤醒**（与 spec US3 一致）。

## 与 Cursor / Firebase 的对应关系

- **身份已建立** 后单独一步 **显式授权**，避免静默向未知客户端发令牌。
- 信息层级：**状态 → 身份 → 风险提醒 → 决策按钮**，符合「极简 + 突出授权确认」。
