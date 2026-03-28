# 临时邮箱浏览器插件 — 产品需求文档（PRD）

> 文档版本：v2.0.2
> 创建日期：2026-03-26
> 更新日期：2026-03-28
> 维护人：yurisachan16-creator
> 状态：进行中

---

## 目录

1. [产品概述](#1-产品概述)
2. [目标用户](#2-目标用户)
3. [版本规划总览](#3-版本规划总览)
4. [功能需求](#4-功能需求)
   - [v0.1 原型版](#v01-原型版)（已发布）
   - [v1.0 闭环版](#v10-闭环版)（已发布）
   - [v1.1 双提供商版](#v11-双提供商版)（已发布）
   - [v1.2 冷门域名版](#v12-冷门域名版)（已发布）
   - [v2.0 多箱管理版](#v20-多箱管理版)（开发中）
   - [v2.1 通知感知版](#v21-通知感知版)（规划中）
   - [v2.2 精品发布版](#v22-精品发布版)（规划中）
5. [技术架构](#5-技术架构)
6. [API 规格](#6-api-规格)
7. [多语言规格](#7-多语言规格)
8. [UI 规格](#8-ui-规格)
9. [非功能需求](#9-非功能需求)
10. [风险与约束](#10-风险与约束)
11. [变更历史](#11-变更历史)

---

## 1. 产品概述

### 1.1 产品名称
**TempMail+**（临时邮箱快速生成插件）

### 1.2 产品定位
一款运行于 Chrome / Firefox / Edge 浏览器的扩展插件（同时提供 Tampermonkey 用户脚本版），帮助用户在需要填写邮箱地址时，快速生成一个一次性临时邮箱，接收验证码或注册邮件，保护个人真实邮箱不被暴露或滥用。

### 1.3 核心价值
| 痛点 | 解决方案 |
|------|----------|
| 注册网站需要邮箱，不想暴露真实邮件 | 一键生成临时邮箱，隔离个人隐私 |
| 切换网站查收验证码，操作繁琐 | 在插件弹窗内直接查看收件，无需跳转 |
| 邮箱填写麻烦，需手动复制粘贴 | 自动识别并填入页面邮箱输入框 |
| 多个注册任务同时进行，邮箱混乱 | 多箱管理，最多 5 个邮箱并行 |
| 临时邮箱域名被目标平台拦截 | 智能选取信誉最低的冷门域名 |

---

## 2. 目标用户

| 用户类型 | 使用场景 |
|----------|----------|
| 普通网民 | 注册不重要的网站账号，避免垃圾邮件 |
| 开发者 / 测试人员 | 批量测试注册流程，无需准备多个真实邮箱 |
| 隐私重视者 | 不希望真实邮箱被第三方收集或出售 |

---

## 3. 版本规划总览

```
v0.1  →  v1.0  →  v1.1  →  v1.2  →  v2.0  →  v2.1  →  v2.2
原型     闭环     双提供商   冷门域名   多箱管理   通知感知   精品发布
```

| 版本 | 状态 | 阶段目标 | 关键交付物 |
|------|------|----------|------------|
| **v0.1** | ✅ 已发布 | 验证核心技术路径 | 生成邮箱 + 展示收件列表 |
| **v1.0** | ✅ 已发布 | 完整使用流程无断点 | 生成→填入→收信→读信全流程，多浏览器，多语言 |
| **v1.1** | ✅ 已发布 | Tampermonkey 可用 | 双提供商回退（1secmail + mail.tm） |
| **v1.2** | ✅ 已发布 | 提升投递率 | 冷门域名池 + 信誉徽章 |
| **v2.0** | 🔨 开发中 | 多箱并行管理 | F-10 多邮箱 + F-13 深色模式 + 浏览器扩展追平双提供商与语言切换 |
| **v2.1** | 📋 规划中 | 主动感知新邮件 | F-11 桌面通知 + F-12 有效期倒计时 |
| **v2.2** | 📋 规划中 | 精品化上架 | F-14 邮件搜索 + F-15 上架商店 |

---

## 4. 功能需求

---

### v0.1 原型版

> 状态：✅ 已于 2026-03-26 发布

#### F-01 生成临时邮箱
- 用户点击「生成」按钮，从 1secmail API 获取随机邮箱地址
- 邮箱地址可一键复制到剪贴板，失败时展示错误提示

#### F-02 展示收件列表
- 弹窗内展示收件列表（发件人、主题、时间），按时间倒序
- 无邮件时展示「暂无邮件」空状态，手动刷新可重新获取

#### F-03 基础弹窗 UI
- 弹窗宽度 380px，展示邮箱地址和收件列表，支持中文

---

### v1.0 闭环版

> 状态：✅ 已于 2026-03-26 发布

#### F-04 邮件详情阅读
- 点击邮件展开正文，HTML 经 DOMPurify 消毒后渲染，支持返回列表

#### F-05 自动填入页面输入框
- 检测 `input[type="email"]` 等选择器，一键填入临时邮箱地址

#### F-06 自动轮询收件
- 生成邮箱后每 10 秒自动刷新，绿色脉冲指示器实时反馈，关闭弹窗后停止

#### F-07 邮箱地址持久化
- 使用 `browser.storage.local` 保存当前邮箱，重开弹窗自动恢复

#### F-08 多语言支持（中/英）
- 默认跟随浏览器语言自动切换，所有 UI 文本通过 i18n 文件管理
- 浏览器扩展与 Tampermonkey 均支持手动切换 `auto / zh / en`

#### F-09 多浏览器兼容
- 使用 `webextension-polyfill`，Chrome/Edge MV3 + Firefox MV2 均可用

---

### v1.1 双提供商版

> 状态：✅ 已于 2026-03-26 发布（Tampermonkey），并在 v2.0.2 补齐到浏览器扩展

- `gmFetch` 升级为双提供商策略：优先 1secmail，遇 403/429/5xx 自动回退 mail.tm
- 新增完整 mail.tm 会话管理（创建账号、JWT 认证、丢弃账号）

---

### v1.2 冷门域名版

> 状态：✅ 已于 2026-03-26 发布（Tampermonkey），并在 v2.0.2 补齐到浏览器扩展

- 新增 `DOMAIN_TIERS` 三级域名池，按 🟢冷门→🟡中等→🔴常见 优先选取
- 邮箱地址旁展示域名信誉徽章，悬停显示说明

---

### v2.0 多箱管理版

> 状态：🔨 开发中
> 目标：允许用户同时管理多个临时邮箱，并统一双提供商、语言与主题体验

#### F-10 多邮箱管理

**描述**：用户可同时保存并切换多个临时邮箱，每个邮箱独立维护收件列表。

**交互流程**：
```
主视图
  ├── 顶部：邮箱选项卡（最多 5 个）
  │     ├── 当前邮箱地址（截断显示）
  │     └── ✕ 删除按钮
  ├── 「+ 新建邮箱」按钮（达到 5 个时置灰）
  └── 邮箱列表区域（仅展示当前选中邮箱的收件）
```

**数据结构**（`browser.storage.local`）：
```json
{
  "mailboxes": [
    {
      "id": "uuid-1",
      "address": "abc123@xojxe.com",
      "label": "Steam 注册",
      "createdAt": 1711500000000,
      "provider": "1secmail"
    }
  ],
  "activeMailboxId": "uuid-1"
}
```

**验收标准**：
- [ ] 最多同时保存 5 个邮箱，超出时「新建」按钮置灰并提示
- [ ] 支持为每个邮箱设置备注标签（label），最长 20 字符
- [ ] 切换邮箱时，收件列表立即更新到对应邮箱的收件
- [ ] 删除邮箱时弹出确认对话框，若为 mail.tm 账号同步删除远端账号
- [ ] 删除后自动切换到列表第一个邮箱；若列表为空则回到「首页」
- [ ] 所有邮箱的轮询并行运行，每个邮箱独立计时
- [ ] 邮箱选项卡支持拖拽排序（可选，降级方案：按创建时间排序）
- [ ] i18n 补充多箱相关文案（`mailbox_limit`、`new_mailbox`、`label_placeholder` 等）

**技术要点**：
- `storage.js` 新增 `getAllMailboxes()`、`addMailbox()`、`removeMailbox()`、`setActiveMailbox()` 方法
- 轮询逻辑从单 `setInterval` 改为 `Map<mailboxId, intervalId>` 管理多个定时器
- 选项卡 UI 超出宽度时横向滚动

---

#### F-13 深色模式

**描述**：跟随系统偏好或手动切换深色 / 浅色主题，设置持久化。

**实现方式**：
- 使用 CSS Custom Properties（变量），切换时在 `<html>` 标签添加 `data-theme="dark"`
- 默认跟随 `prefers-color-scheme` 媒体查询
- 设置选项：「跟随系统」/ 「始终浅色」/ 「始终深色」

**深色色彩方案**：
```css
[data-theme="dark"] {
  --color-primary: #6366F1;
  --color-bg: #111827;
  --color-surface: #1F2937;
  --color-text: #F9FAFB;
  --color-text-secondary: #9CA3AF;
  --color-border: #374151;
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #F87171;
}
```

**验收标准**：
- [ ] 支持 `prefers-color-scheme` 自动切换（默认行为）
- [ ] 设置中可手动选择「跟随系统 / 浅色 / 深色」，选择持久化到 storage
- [ ] 所有视图（主视图、详情视图、设置视图）均适配深色主题
- [ ] 主题切换无闪烁（在 `popup.html` `<head>` 内联初始化脚本，避免 FOUC）
- [ ] i18n 补充 `theme_auto`、`theme_light`、`theme_dark` 文案

**技术要点**：
- `storage.js` 新增 `getTheme()` / `setTheme()` 方法
- `popup.js` 加载时同步读取主题并在 DOM 渲染前应用，避免闪烁
- 设置页同时提供语言切换：`跟随浏览器 / 中文 / English`

---

### v2.1 通知感知版

> 状态：📋 规划中
> 目标：让用户即使未打开弹窗也能感知新邮件到达

#### F-11 新邮件桌面通知

**描述**：收到新邮件时，通过浏览器 `notifications` API 弹出桌面提醒。

**交互流程**：
```
后台轮询发现新邮件
  → 发送 chrome.notifications.create()
  → 通知内容：「发件人：xxx | 主题：xxx」
  → 点击通知 → 打开插件弹窗并定位到该邮件
```

**验收标准**：
- [ ] 通知内容包含发件人、主题，图标使用插件 icon
- [ ] 点击通知可打开弹窗并自动滚动到对应邮件（通过 `chrome.action.openPopup`）
- [ ] 设置中提供「开启通知」开关，默认开启，选择持久化
- [ ] 多邮箱场景下，通知标注来自哪个邮箱（含 label 或地址）
- [ ] manifest 需新增 `notifications` 权限

**技术要点**：
- 轮询逻辑迁移到 `background.js`（Service Worker），确保弹窗关闭时仍能接收新邮件并发送通知
- popup 与 background 通过 `chrome.runtime.sendMessage` / `onMessage` 通信
- Firefox MV2 使用 `browser.notifications`（polyfill 已兼容）

---

#### F-12 邮箱有效期倒计时

**描述**：1secmail 邮箱约有效 1 小时，在 UI 展示剩余时间并提前预警。

**交互流程**：
```
邮箱创建时记录 createdAt 时间戳
  → 主视图邮箱地址下方展示「剩余 XX 分钟」
  → < 10 分钟：文字变黄（warning）+ ⚠ 图标
  → 到期后：提示「邮箱已失效，请重新生成」+ 停止轮询
```

**验收标准**：
- [ ] 显示格式：`剩余 XX 分 XX 秒`，每秒更新
- [ ] 距到期 ≤ 10 分钟时，颜色切换为 `--color-warning`
- [ ] 到期后停止轮询，展示失效提示，「重新生成」按钮可一键替换当前邮箱
- [ ] mail.tm 邮箱（无官方有效期限制）不展示倒计时，或展示「长期有效」
- [ ] 多邮箱场景：选项卡上对即将过期的邮箱展示 ⚠ 角标

**技术要点**：
- `createdAt` 字段已在 F-10 数据结构中记录
- 前端用 `setInterval(1000)` 驱动倒计时显示（无需后台参与）
- 有效期常量 `MAILBOX_TTL_MS = 60 * 60 * 1000`，可配置

---

### v2.2 精品发布版

> 状态：📋 规划中
> 目标：补全体验细节，完成商店上架

#### F-14 邮件内容搜索

**描述**：在收件列表顶部提供搜索框，按关键词实时过滤邮件。

**验收标准**：
- [ ] 支持按发件人、主题关键词搜索，大小写不敏感
- [ ] 输入时实时过滤，无需点击提交
- [ ] 无匹配结果时展示「未找到相关邮件」
- [ ] 清空搜索框自动恢复完整列表
- [ ] 多邮箱场景：搜索仅在当前选中邮箱的收件中进行

---

#### F-15 上架插件商店

**描述**：打包并提交到 Chrome Web Store、Firefox Add-ons、Microsoft Edge Add-ons。

**验收标准**：
- [ ] 符合各商店隐私政策（无远程代码执行、最小权限原则）
- [ ] 提供 1280×800 商店截图（浅色 + 深色各一组，至少 3 张）
- [ ] 完成英文商店描述文案（简介 ≤ 132 字符，详情 ≤ 16000 字符）
- [ ] 版本号打到 `2.x.x`，manifest `version` 字段同步
- [ ] README.md 更新安装说明与截图

---

## 5. 技术架构

### 5.1 目录结构（v2.0 目标）

```
D:\社团练习\网页插件\
├── src/
│   ├── manifest.json               # Chrome/Edge MV3（主）
│   ├── manifest/
│   │   ├── manifest.chrome.json
│   │   └── manifest.firefox.json
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js                # 多箱 UI 逻辑、主题初始化
│   │   └── popup.css               # CSS Variables 双主题
│   ├── background/
│   │   └── background.js           # Service Worker：轮询 + 通知（v2.1）
│   ├── content/
│   │   └── content-script.js       # 自动填入
│   ├── api/
│   │   └── mailService.js          # 1secmail / mail.tm API 封装
│   ├── utils/
│   │   ├── storage.js              # 多邮箱数据结构、主题设置
│   │   └── sanitize.js             # DOMPurify
│   ├── i18n/
│   │   ├── zh.json                 # 中文（含 v2.0 新增键）
│   │   └── en.json                 # 英文（含 v2.0 新增键）
│   ├── icons/                      # 16/48/128px
│   └── lib/                        # webextension-polyfill, DOMPurify
├── tampermonkey/
│   └── TempMail+.user.js
├── tests/
│   ├── api/mailService.test.js
│   ├── utils/storage.test.js       # 需补充多箱相关用例
│   ├── utils/sanitize.test.js
│   ├── i18n/i18n.test.js
│   ├── content/content.test.js
│   └── tampermonkey/gmApi.test.js
├── scripts/
│   └── copy-libs.js
├── PRD.md
├── CHANGELOG.md
├── HANDOFF.md
├── CLAUDE.md
└── README.md
```

### 5.2 技术选型

| 技术点 | 选型 | 原因 |
|--------|------|------|
| 框架 | 原生 JS（无框架） | 插件体积小、无构建依赖 |
| 跨浏览器 API | `webextension-polyfill` | 统一 `browser.*` API |
| 邮件 HTML 渲染 | DOMPurify | XSS 防护 |
| 样式主题 | CSS Custom Properties | 深色模式切换，无预处理器 |
| 多邮箱存储 | `browser.storage.local` | 跨会话持久化，结构化 JSON |
| 打包 | 无打包（直接加载） | 原型/v2 阶段无需 |

### 5.3 v2.0 新增模块依赖关系

```
popup.js
  ├── storage.js      getAllMailboxes / addMailbox / removeMailbox
  ├── mailService.js  apiGetMessages（按 mailboxId 查询）
  └── i18n            zh/en（含多箱文案）

background.js（v2.1）
  ├── storage.js      getAllMailboxes（读取所有邮箱轮询）
  ├── mailService.js  apiGetMessages
  └── chrome.notifications
```

### 5.4 Git 分支策略

```
main            ← 稳定发布版，打 tag（v2.0.0 / v2.1.0 / v2.2.0）
  └── develop   ← 日常开发集成分支
        ├── feat/multi-mailbox      ← F-10 多邮箱管理
        ├── feat/dark-mode          ← F-13 深色模式
        ├── feat/notifications      ← F-11 桌面通知（v2.1）
        ├── feat/expiry-countdown   ← F-12 有效期倒计时（v2.1）
        ├── feat/mail-search        ← F-14 邮件搜索（v2.2）
        └── docs/prd-v2             ← 本次文档更新
```

---

## 6. API 规格

### 6.1 主提供商：1secmail

**Base URL**：`https://www.1secmail.com/api/v1/`

| 功能 | 接口 |
|------|------|
| 获取可用域名列表 | `?action=getDomainList` |
| 生成随机邮箱 | `?action=genRandomMailbox&count=1` |
| 获取收件列表 | `?action=getMessages&login={login}&domain={domain}` |
| 读取邮件详情 | `?action=readMessage&login={login}&domain={domain}&id={id}` |
| 删除邮件 | `?action=deleteMessage&login={login}&domain={domain}&id={id}` |

**域名分级**（v1.2 引入）：
- 🟢 冷门：`xojxe.com`、`yoggm.com`、`esiix.com`
- 🟡 中等：`wwjmp.com`、`kzccv.com`、`qiott.com`
- 🔴 常见：`1secmail.org`、`1secmail.net`、`1secmail.com`

### 6.2 备用提供商：mail.tm

**Base URL**：`https://api.mail.tm`

| 功能 | 接口 |
|------|------|
| 创建账号 | `POST /accounts` |
| 获取 Token | `POST /token` |
| 获取收件列表 | `GET /messages` |
| 读取邮件详情 | `GET /messages/{id}` |
| 删除账号 | `DELETE /accounts/{id}` |

### 6.3 错误处理规范

| 场景 | 处理方式 |
|------|----------|
| 网络请求失败 | 展示「网络异常，请检查连接」，提供重试按钮 |
| API 返回空数组 | 展示「暂无邮件」空状态 |
| API 限流（429） | 停止该邮箱的轮询，展示「请求过于频繁，稍后重试」 |
| 邮箱已过期（v2.1）| 提示「邮箱已失效」，引导重新生成 |
| 单提供商 403/5xx | 自动 fallback 到备用提供商（Tampermonkey 版） |

---

## 7. 多语言规格

### 7.1 支持语言

| 语言代码 | 语言 | 优先级 |
|----------|------|--------|
| `zh` | 中文（简体） | 默认 |
| `en` | English | 次选 |

### 7.2 v2.0 新增语言键

```json
// zh.json 新增
{
  "new_mailbox": "新建邮箱",
  "mailbox_limit": "最多同时保存 5 个邮箱",
  "label_placeholder": "备注（可选）",
  "delete_mailbox_confirm": "确认删除此邮箱？收件记录将一并清除。",
  "no_mailbox": "还没有临时邮箱，点击「新建」开始使用",
  "theme_auto": "跟随系统",
  "theme_light": "浅色",
  "theme_dark": "深色",
  "expiry_remaining": "剩余 {m} 分 {s} 秒",
  "expiry_warning": "即将过期，请及时保存内容",
  "expiry_expired": "邮箱已失效，请重新生成",
  "notification_toggle": "新邮件桌面通知",
  "search_placeholder": "搜索发件人或主题…",
  "search_no_result": "未找到相关邮件"
}
```

---

## 8. UI 规格

### 8.1 弹窗尺寸
- 宽度：`380px`（固定）
- 高度：最小 `200px`，最大 `560px`（超出滚动）

### 8.2 主要视图（v2.0 更新）

| 视图 | 触发条件 | 主要元素 |
|------|----------|----------|
| **首页（无邮箱）** | 首次安装或所有邮箱已删除 | 「新建临时邮箱」按钮 |
| **主视图** | 有邮箱时 | 邮箱选项卡 + 邮箱地址 + 信誉徽章 + 复制 + 收件列表 |
| **邮件详情视图** | 点击某封邮件 | 返回 + 发件人/主题/时间 + 正文 |
| **设置视图** | 点击设置图标 | 语言 + 主题 + 通知开关（v2.1）|
| **新建邮箱对话框** | 点击「+」按钮 | 备注输入框 + 确认生成 |

### 8.3 颜色方案

**浅色（默认）**：
```css
--color-primary: #4F46E5;
--color-bg: #FFFFFF;
--color-surface: #F9FAFB;
--color-text: #111827;
--color-text-secondary: #6B7280;
--color-border: #E5E7EB;
--color-success: #10B981;
--color-warning: #F59E0B;
--color-error: #EF4444;
```

**深色**：
```css
--color-primary: #6366F1;
--color-bg: #111827;
--color-surface: #1F2937;
--color-text: #F9FAFB;
--color-text-secondary: #9CA3AF;
--color-border: #374151;
--color-success: #34D399;
--color-warning: #FBBF24;
--color-error: #F87171;
```

### 8.4 邮箱选项卡（v2.0 新增）

```
┌─────────────────────────────────────┐
│ [abc@xojxe 🟢 ✕] [xyz@wwjmp 🟡 ✕] [+] │  ← 选项卡行
├─────────────────────────────────────┤
│  abc123@xojxe.com    [复制] [填入]  │
│  Steam 注册  · 剩余 45 分 20 秒     │  ← v2.1 倒计时
├─────────────────────────────────────┤
│  收件列表...                        │
└─────────────────────────────────────┘
```

---

## 9. 非功能需求

| 指标 | 要求 |
|------|------|
| 插件包体积 | < 500KB（不含 polyfill） |
| 弹窗首次渲染 | < 300ms |
| API 请求超时 | 10 秒后自动失败并提示 |
| 轮询间隔 | 10 秒/邮箱（多邮箱并行，各自独立计时） |
| 内存占用 | 后台脚本空闲时不超过 10MB |
| 安全 | 所有渲染的 HTML 邮件内容必须经过 DOMPurify 处理 |
| 主题切换 | 无 FOUC（页面闪烁） |

---

## 10. 风险与约束

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| 1secmail API 不稳定 | 核心功能失效 | 双提供商 fallback（v1.1 已实现） |
| 多邮箱轮询频率过高 | 触发 API 限流 | 错开各邮箱的轮询起始时间（随机偏移 0-9s） |
| MV3 Service Worker 被休眠 | 后台轮询中断 | 使用 `chrome.alarms` API 替代 `setInterval`（v2.1） |
| 临时邮箱被目标网站屏蔽 | 用户无法用于某些网站 | 文档说明，提供冷门域名选取（v1.2 已实现） |
| XSS 攻击（恶意邮件内容） | 安全漏洞 | 强制使用 DOMPurify |
| 商店审核拒绝 | 无法上架 | 提前阅读各商店开发者政策，最小权限原则 |

---

## 11. 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v0.1.0 | 2026-03-26 | 初始版本，完成产品定义与版本规划 |
| v2.0.0 | 2026-03-27 | 补全 v2.0/v2.1/v2.2 详细需求；同步记录 v1.1/v1.2 已发布内容；新增多箱数据结构、深色色彩方案、Git 分支规划 |
| v2.0.2 | 2026-03-28 | 同步浏览器扩展双提供商回退、冷门域名、手动语言切换；更新设置视图与共享邮件服务实现说明 |
