# UI Contract: 设备管理页（002-device-manage）

**Date**: 2026-04-07  
**Route（示例）**: `{BASE_PATH}/admin/devices`

## 布局

1. **顶部 Stat Cards（四列，移动端纵向堆叠）**  
   - 总设备数  
   - 在线数（绿色强调）  
   - 离线数（中性灰）  
   - 异常数（琥珀/橙色；定义见 `research.md`）

2. **筛选栏**  
   - 状态（在线/离线/封禁/异常）  
   - 用户（搜索或选择）  
   - IP（模糊或 CIDR，若实现）

3. **响应式表格**  
   - 小屏：允许横向滚动；次要列（MAC、技能）可折叠至「更多」。

## 列定义

| 列 | 内容 | 交互/视觉 |
|----|------|-----------|
| 状态 | 在线 / 离线 / 封禁 | **在线**：Ping 圆点（`animate-ping`）+ 呼吸 opacity；**离线**：灰实心；**封禁**：红实心 |
| 设备名 / 用户名 | `device.name` + `owner` 展示名 | 文本 |
| IP | `last_ip` + 地理文案 | **可点击** → Modal 展示 `hardware_snapshot` 与解析规则说明 |
| MAC | 规范化字符串 | 等宽字体 |
| 当前技能 | `current_skill_slug` | 无则「—」 |
| 最后活跃 | `last_seen` 相对时间 | |
| 操作 | 远程重启、断开连接、查看日志 | 危险操作二次确认；与 OpenAPI 对齐 |

## 无障碍

- 状态不仅依赖颜色：附 `aria-label` 与文本。  
- `prefers-reduced-motion: reduce` 时关闭 Ping 动画，仅保留色点。
