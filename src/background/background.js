/**
 * background.js — 后台服务脚本（v1.0 闭环版）
 *
 * v1.0 的轮询逻辑（F-06）由 popup.js 的 setInterval 实现，
 * 弹窗关闭后自动停止，无需在此处处理。
 *
 * Chrome MV3 Service Worker 需保持文件存在才能注册；
 * v2.0 将在此实现桌面通知（F-11）和离线轮询（F-06 增强）。
 */

'use strict';
