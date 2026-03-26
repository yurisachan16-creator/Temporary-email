/**
 * content-script.js — 内容脚本（运行于目标网页上下文）
 *
 * 职责：监听来自弹窗的消息，将临时邮箱地址填入页面输入框。
 * 使用 chrome.* API（Chrome/Edge/Firefox 均兼容，无需 polyfill）。
 */

'use strict';

/* ── 邮箱输入框选择器（优先级从高到低）────────────── */
const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name*="email"]',
  'input[id*="email"]',
  'input[placeholder*="email"]',
  'input[placeholder*="邮箱"]'
];

/**
 * 在当前页面文档中查找邮箱输入框
 * @returns {HTMLInputElement|null}
 */
function findEmailInput() {
  for (const selector of EMAIL_SELECTORS) {
    const input = document.querySelector(selector);
    if (input) return input;
  }
  return null;
}

/**
 * 将邮箱地址填入输入框并触发框架感知事件
 * @param {HTMLInputElement} input
 * @param {string} email
 * @returns {boolean}
 */
function fillEmail(input, email) {
  if (!input || !email) return false;
  input.value = email;
  // 分别触发 input 和 change 事件，确保 React/Vue 等框架响应值变化
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // 聚焦输入框，提升用户体验
  input.focus();
  return true;
}

/* ── 消息监听器 ───────────────────────────────────── */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'fillEmail') {
    const input   = findEmailInput();
    const success = fillEmail(input, request.email);
    // found: 是否找到了输入框；success: 是否填写成功
    sendResponse({ success, found: input !== null });
  }
  // 返回 true 保持消息通道开放，支持异步 sendResponse
  return true;
});
