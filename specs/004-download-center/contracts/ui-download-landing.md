# UI Contract: 公网下载落地页（Landing）

**风格**: 极简、大方；典型 **Landing Page**；减少干扰信息以**消除安装焦虑**。

## 路由

- 路径：`{BASE_PATH}/download`（或项目约定的等价静态优先路由），与后端 API 前缀一致。

## 布局（自上而下）

1. **Hero Section（居中）**  
   - 客户端**最新版 Logo**（来自 `download-context.logo_url`）。  
   - **Slogan** 一行短句（来自 `slogan` 或品牌配置）。

2. **下载按钮组**  
   - 三平台：**Windows（.exe）**、**macOS（.dmg）**、**Linux（.deb）**。  
   - 根据 `recommended_platform` **自动高亮**对应按钮（边框/背景/主色）。  
   - `unknown` 时三按钮**同等权重**，文案提示「选择你的系统」。  
   - 主按钮文案示例：`立即下载 · Windows`。

3. **Changelog / Release Notes**  
   - **桌面宽屏**：置于 Hero/下载区 **右侧** 侧栏。  
   - **窄屏**：置于下载区 **下方** 全宽。  
   - 列表展示版本迭代；每条可带标签：**New**（`type: new`）、**Fix**（`type: fix`）。  
   - 附 **Release Notes** 摘要（纯文本或 sanitize 后的 Markdown）。

4. **校验码区域**  
   - 对**当前推荐平台**（或用户选中的平台）展示 **MD5** 与 **SHA256**，支持一键复制。  
   - 小号等宽字体，避免抢占主视觉。

## 非落地页范围（Client-only）

- **下载进度条动画**：仅在**桌面客户端**执行应用内升级下载时展示；本 Web 落地页**不**模拟浏览器下载进度条（避免误导）。  
- 若产品后续提供「内嵌 WebView 升级页」，可复用同一进度语义，不在本期 Web 契约内实现。

## 可访问与状态

- 按钮具备 `aria-label`（含平台与文件扩展名）。  
- 某平台资产缺失时：对应按钮 **disabled** + 说明「即将提供」。
