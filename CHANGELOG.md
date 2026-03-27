# 版本变更记录

本文件记录所有版本的变更内容，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范。

---

## [未发布]

## [2.0.1] - 2026-03-27

### 修复
- **MV3 CSP 兼容**：将 `popup.html` 中的主题初始化内联脚本提取为独立文件 `theme-init.js`，避免被 Manifest V3 默认 CSP 阻断，恢复深色模式 FOUC 防护
- **轮询竞态**：为 `popup.js` 中的多邮箱轮询新增 `pollingInFlight` 保护，避免同一邮箱在慢请求下出现并发堆积
- **v1 迁移清理**：`migrateFromV1` 改为迁移后显式删除旧的 `currentEmail` 键，避免写入 `null` 带来的跨浏览器兼容差异
- **版本元数据**：同步更新扩展与包版本号至 `2.0.1`

## [2.0.0] - 2026-03-27

### 新增（浏览器扩展版）
- **F-10 多邮箱管理**：最多同时保存 5 个邮箱，选项卡切换，各自独立轮询
  - `storage.js` 新增 `getAllMailboxes` / `addMailbox` / `removeMailbox` / `getActiveMailboxId` / `setActiveMailboxId`
  - 邮箱支持备注标签（最多 20 字），选项卡显示标签或用户名
  - 删除邮箱时自动切换到下一个，列表为空时回到空状态
  - v1.x `currentEmail` 数据自动迁移到新格式
- **F-13 深色模式**：跟随系统或手动切换浅色 / 深色主题
  - `storage.js` 新增 `getTheme` / `setTheme`
  - `popup.html` 头部内联脚本防止切换闪烁（FOUC）
  - 新增设置视图（头部 ⚙ 按钮进入），包含主题三档选择器
  - `popup.css` 新增 `[data-theme="dark"]` 完整深色色彩方案

### 变更
- `popup.js` 重写为多邮箱状态管理（`pollTimers Map`、`knownMailIds Map`）
- i18n 新增多箱和主题相关文案（中/英各 14 个新键）

### 测试
- `storage.test.js` 新增 24 条测试，总计 138 条全部通过

## [1.2.0] - 2026-03-26

### 新增（Tampermonkey 版）
- **冷门域名池**：新增 `DOMAIN_TIERS` 常量，将 1secmail 域名按信誉分为三级：
  - 🟢 冷门（xojxe.com、yoggm.com、esiix.com）— Steam/Discord 等平台拦截率最低
  - 🟡 中等（wwjmp.com、kzccv.com、qiott.com）
  - 🔴 常见（1secmail.org/net/com）— 已被大多数平台识别
- `apiGetDomainList`：调用 1secmail `getDomainList` 接口获取当前全部可用域名，结果本地缓存避免重复请求
- `apiGetBestDomain`：从可用域名中按冷→中→热顺序选取信誉最低的域名
- `getDomainTierLabel`：返回域名对应的信誉等级标签（🟢/🟡/🔴）
- `showMain` 更新：在邮箱地址旁展示域名信誉徽章，鼠标悬停显示详细说明
- 域名信誉徽章样式（`.tm-domain-badge`）

### 变更
- `apiGenerateEmail` 不再调用 `genRandomMailbox`，改为自行构造邮箱地址（`随机login@最冷门可用域名`），失败时仍回退到 mail.tm
- 测试用例从 102 条扩展至 114 条，覆盖新增的域名池全路径

## [1.1.0] - 2026-03-26

### 修复
- **Tampermonkey 403 问题**：`gmFetch` 升级为双提供商策略：
  优先请求 1secmail，遇到 403 / 429 / 5xx / 网络错误时自动回退到 mail.tm
- **丢弃邮箱**：`handleDiscard` 现在会同步删除 mail.tm 远端账号并清除完整会话

### 新增（Tampermonkey 版）
- `gmFetch` 支持 POST 请求、自定义 headers、body 序列化、204 处理
- `createMailTmSession`：自动创建 mail.tm 账号并获取 JWT token
- `mailTmRequest`：带 Bearer 认证的请求封装，401 时自动刷新 token 后重试
- `resolveSession`：根据邮箱地址自动判断当前提供商（1secmail / mail.tm）
- `apiDiscardCurrentSession`：丢弃邮箱时删除 mail.tm 账号
- 会话对象（provider / token / accountId）持久化到 `GM_setValue`
- `tests/tampermonkey/gmApi.test.js` 扩展至 102 个测试用例，覆盖双提供商全路径

## [1.0.0] - 2026-03-26

### 新增
- **F-04** 邮件详情视图：点击邮件条目展开完整正文，HTML 经 DOMPurify 消毒后渲染
- **F-05** 自动填入：通过 content-script 将邮箱地址注入当前标签页输入框
- **F-06** 轮询收件箱：每 10 秒自动刷新，弹窗关闭后停止；绿色脉冲指示器实时反馈
- **F-08** 多语言支持：检测浏览器语言，自动切换中文 / 英文
- **F-09** 持久化存储：迁移至 browser.storage.local（通过 webextension-polyfill）
- 引入 webextension-polyfill（browser.* Promise API，兼容三端）
- 引入 DOMPurify 对邮件 HTML 正文进行 XSS 消毒
- Toast 轻提示：新邮件到达与自动填入成功时显示
- content-script.js：注入所有页面，响应 fillEmail 消息
- manifest 三端配置更新：添加 tabs 权限、content_scripts 声明、background service worker

### 变更
- popup.js 全量重写，迁移至 browser.* API
- 版本号升级：0.1.0 → 1.0.0

## [0.1.0] - 2026-03-26

### 新增
- 初始化项目仓库
- 创建产品需求文档（PRD.md）
- 建立版本管理规范（Git 分支策略 + Conventional Commits）
