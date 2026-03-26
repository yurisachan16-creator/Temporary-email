# 版本变更记录

本文件记录所有版本的变更内容，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范。

---

## [未发布]

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
