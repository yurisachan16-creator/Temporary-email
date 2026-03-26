# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**TempMail+** — 支持 Chrome / Firefox / Edge 的临时邮箱浏览器插件。
详细需求见 `PRD.md`，版本变更见 `CHANGELOG.md`。

## 加载插件（开发调试）

- **Chrome / Edge**：打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `src/` 目录
- **Firefox**：打开 `about:debugging#/runtime/this-firefox` → 「临时载入附加组件」→ 选择 `src/manifest/manifest.firefox.json`

## 代码规范

- 所有注释使用**中文**
- 提交信息遵循 Conventional Commits：`feat:` / `fix:` / `chore:` / `docs:` / `style:`
- 分支策略：`main`（发布）← `develop`（集成）← `feat/*` / `fix/*`（功能/修复）

## 架构要点

- `src/api/mailService.js` 封装所有 1secmail API 调用，其他模块不直接 fetch
- `src/utils/storage.js` 统一封装 `browser.storage.local`，跨浏览器兼容
- `src/utils/sanitize.js` 使用 DOMPurify 处理所有渲染到 DOM 的邮件 HTML 内容
- 跨浏览器 API 统一使用 `webextension-polyfill`（`browser.*` 命名空间）
- 多语言文本统一放在 `src/i18n/zh.json` 和 `src/i18n/en.json`，不在 JS/HTML 中硬编码

## 版本阶段

| Tag | 阶段 | 目标 |
|-----|------|------|
| v0.1.x | 原型 | 生成邮箱 + 展示收件列表 |
| v1.0.x | 闭环 | 全流程可用 + 多浏览器 + 多语言 |
| v2.0.x | 优化 | 多箱管理 + 通知 + 深色模式 |
