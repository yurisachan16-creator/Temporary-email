/**
 * popup.js — TempMail+ 弹窗逻辑（v1.0 闭环版）
 *
 * 依赖（按 HTML 加载顺序）：
 *   browser-polyfill.min.js → 提供 browser.* Promise API（兼容三端）
 *   dompurify.min.js        → 提供 DOMPurify，用于邮件 HTML 消毒
 *   translations.js         → 提供 window.TRANSLATIONS 语言包
 *
 * 功能覆盖（PRD v1.0）：
 *   F-04 邮件详情展示（渲染消毒后的 HTML 正文）
 *   F-05 自动填入（通过 content-script 填入页面输入框）
 *   F-06 轮询收件箱（每 10 s 刷新，弹窗关闭后自动停止）
 *   F-08 多语言（检测浏览器语言，zh / en 双语）
 *   F-09 本地持久化（browser.storage.local）
 */

'use strict';

/* ── 常量 ───────────────────────────────────────────── */
const API_BASE      = 'https://www.1secmail.com/api/v1/';
const STORAGE_KEY   = 'currentEmail';   // 与 storage.js 保持一致
const POLL_INTERVAL = 10_000;           // 轮询间隔（毫秒）

/* ── 运行时状态 ──────────────────────────────────────── */
let currentEmail  = null;   // 当前使用的邮箱地址
let pollTimer     = null;   // setInterval 句柄
let currentLang   = 'zh';  // 当前语言（默认中文）

/* ── 工具函数 ─────────────────────────────────────────── */

/**
 * 通过 ID 获取 DOM 元素（简写）
 * @param {string} id
 * @returns {HTMLElement}
 */
function $(id) { return document.getElementById(id); }

/**
 * 将邮箱地址拆分为 login 和 domain
 * @param {string} email
 * @returns {{ login: string, domain: string }}
 */
function parseEmail(email) {
  const [login, domain] = email.split('@');
  return { login, domain };
}

/* ── 国际化 ──────────────────────────────────────────── */

/**
 * 初始化语言：读取浏览器语言，匹配 zh / en，默认 zh
 */
function initLang() {
  const nav  = (navigator.language || 'zh').toLowerCase();
  currentLang = nav.startsWith('en') ? 'en' : 'zh';
}

/**
 * 翻译键值查询
 * @param {string} key
 * @returns {string}
 */
function t(key) {
  const translations = window.TRANSLATIONS || {};
  const pack     = translations[currentLang] || {};
  const fallback = translations['en']        || {};
  if (key in pack)     return pack[key];
  if (key in fallback) return fallback[key];
  return key;
}

/**
 * 将页面中所有 [data-i18n] 元素的文本替换为对应翻译
 */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // 单独更新空状态描述（包含换行，不走 data-i18n）
  const emptyDesc = $('empty-desc');
  if (emptyDesc) emptyDesc.textContent = t('empty_desc');
}

/* ── API 调用 ─────────────────────────────────────────── */

/**
 * 生成随机临时邮箱
 * @returns {Promise<string>}
 */
async function apiGenerateEmail() {
  const res = await fetch(`${API_BASE}?action=genRandomMailbox&count=1`);
  if (!res.ok) throw new Error(`${t('error_network')}（${res.status}）`);
  const [email] = await res.json();
  return email;
}

/**
 * 获取指定邮箱的收件列表
 * @param {string} login
 * @param {string} domain
 * @returns {Promise<Array>}
 */
async function apiGetMessages(login, domain) {
  const res = await fetch(
    `${API_BASE}?action=getMessages&login=${login}&domain=${domain}`
  );
  if (!res.ok) throw new Error(`${t('error_network')}（${res.status}）`);
  return res.json();
}

/**
 * 读取单封邮件完整内容
 * @param {string} login
 * @param {string} domain
 * @param {number} msgId
 * @returns {Promise<Object>}
 */
async function apiReadMessage(login, domain, msgId) {
  const res = await fetch(
    `${API_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`
  );
  if (!res.ok) throw new Error(`${t('error_network')}（${res.status}）`);
  return res.json();
}

/* ── Storage ──────────────────────────────────────────── */

/**
 * 读取已保存的邮箱地址
 * @returns {Promise<string|null>}
 */
async function readSavedEmail() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

/**
 * 持久化保存邮箱地址
 * @param {string} email
 */
async function persistEmail(email) {
  await browser.storage.local.set({ [STORAGE_KEY]: email });
}

/**
 * 清除已保存的邮箱地址
 */
async function eraseEmail() {
  await browser.storage.local.remove(STORAGE_KEY);
}

/* ── Toast 轻提示 ─────────────────────────────────────── */

let toastTimer = null;

/**
 * 显示 Toast 提示，2 秒后自动消失
 * @param {string} message
 */
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

/* ── 错误横幅 ──────────────────────────────────────────── */

/**
 * 在底部横幅显示错误信息，3 秒后自动消失
 * @param {string} message
 */
function showError(message) {
  const el = $('view-error');
  el.hidden      = false;
  el.textContent = `⚠ ${message}`;
  setTimeout(() => { el.hidden = true; }, 3000);
}

/* ── UI 视图切换 ────────────────────────────────────────── */

/**
 * 显示空状态视图（尚未生成邮箱）
 */
function showEmpty() {
  $('view-empty').hidden  = false;
  $('view-main').hidden   = true;
  $('view-detail').hidden = true;
  $('view-error').hidden  = true;
  stopPolling();
}

/**
 * 显示主视图（已有邮箱）
 * @param {string} email
 */
function showMain(email) {
  $('view-empty').hidden  = true;
  $('view-main').hidden   = false;
  $('view-detail').hidden = true;
  const el = $('email-address');
  el.textContent = email;
  el.title       = email;
}

/**
 * 显示邮件详情视图
 * @param {Object} msg - 邮件完整内容（来自 readMessage API）
 */
function showDetail(msg) {
  $('view-empty').hidden  = true;
  $('view-main').hidden   = true;
  $('view-detail').hidden = false;

  // 主题
  $('detail-subject').textContent = msg.subject || t('no_subject');

  // 发件人
  $('detail-from').textContent = `${t('mail_from')}: ${msg.from || ''}`;

  // 时间
  $('detail-date').textContent = `${t('mail_date')}: ${msg.date || ''}`;

  // 正文：优先 HTML，使用 DOMPurify 消毒后渲染；无 HTML 则使用纯文本
  const detailBody = $('detail-body');
  if (msg.htmlBody && msg.htmlBody.trim()) {
    detailBody.innerHTML = DOMPurify.sanitize(msg.htmlBody);
  } else {
    // 纯文本：转义后放入 <pre> 风格的 div
    detailBody.textContent = msg.textBody || '';
  }
}

/* ── 邮件列表渲染 ───────────────────────────────────────── */

/**
 * 在邮件列表区域展示状态文字
 * @param {string} text
 * @param {boolean} [isError=false]
 */
function setMailStatus(text, isError = false) {
  $('mail-list').innerHTML =
    `<div class="state-text${isError ? ' is-error' : ''}">${text}</div>`;
}

/** 上一次渲染时的邮件 ID 集合（用于检测新邮件） */
let knownMailIds = new Set();

/**
 * 将收件列表渲染到 DOM，并检测新邮件
 * @param {Array} messages
 */
function renderMessages(messages) {
  if (messages.length === 0) {
    setMailStatus(t('no_mail'));
    return;
  }

  // 检测新邮件
  const newIds = messages.map(m => m.id);
  const hasNew = newIds.some(id => !knownMailIds.has(id));
  if (hasNew && knownMailIds.size > 0) {
    // 首次加载不提示，后续轮询有新邮件才提示
    showToast(t('new_mail'));
  }
  knownMailIds = new Set(newIds);

  $('mail-list').innerHTML = messages.map(msg => `
    <div class="mail-item" data-id="${msg.id}" role="button" tabindex="0">
      <div class="mail-from">${escHtml(msg.from)}</div>
      <div class="mail-subject">${escHtml(msg.subject || t('no_subject'))}</div>
      <div class="mail-date">${escHtml(msg.date)}</div>
    </div>
  `).join('');

  // 为每个邮件条目绑定点击事件
  $('mail-list').querySelectorAll('.mail-item').forEach(item => {
    item.addEventListener('click', () => handleMailClick(Number(item.dataset.id)));
  });
}

/**
 * HTML 特殊字符转义（仅用于列表中纯文本展示）
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── 轮询收件箱 ─────────────────────────────────────────── */

/**
 * 启动轮询（每 POLL_INTERVAL 毫秒刷新一次收件箱）
 * @param {string} email
 */
function startPolling(email) {
  stopPolling(); // 防止重复启动
  $('poll-indicator').hidden = false;
  pollTimer = setInterval(() => loadMessages(email), POLL_INTERVAL);
}

/**
 * 停止轮询并隐藏状态指示器
 */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const indicator = $('poll-indicator');
  if (indicator) indicator.hidden = true;
}

/* ── 加载收件箱 ─────────────────────────────────────────── */

/**
 * 加载并渲染指定邮箱的收件列表
 * @param {string} email
 */
async function loadMessages(email) {
  const { login, domain } = parseEmail(email);
  try {
    const messages = await apiGetMessages(login, domain);
    renderMessages(messages);
  } catch (e) {
    setMailStatus(e.message, true);
  }
}

/* ── 事件处理器 ─────────────────────────────────────────── */

/**
 * 生成新临时邮箱
 */
async function handleGenerate() {
  const btn = $('btn-generate');
  btn.disabled    = true;
  btn.textContent = t('loading');

  try {
    const email = await apiGenerateEmail();
    await persistEmail(email);
    currentEmail = email;
    knownMailIds = new Set(); // 重置已知邮件集合
    showMain(email);
    setMailStatus(t('loading'));
    await loadMessages(email);
    startPolling(email);
  } catch (e) {
    showError(e.message);
    btn.disabled    = false;
    btn.textContent = t('generate');
  }
}

/**
 * 复制邮箱地址到剪贴板
 */
async function handleCopy() {
  if (!currentEmail) return;
  try {
    await navigator.clipboard.writeText(currentEmail);
    const btn = $('btn-copy');
    const orig = btn.textContent;
    btn.textContent = t('copied');
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    showError(t('error_network'));
  }
}

/**
 * 刷新收件列表
 */
async function handleRefresh() {
  if (!currentEmail) return;
  setMailStatus(t('loading'));
  await loadMessages(currentEmail);
}

/**
 * 丢弃当前邮箱并回到空状态（需用户确认）
 */
async function handleDiscard() {
  if (!confirm(t('confirm_discard'))) return;
  stopPolling();
  await eraseEmail();
  currentEmail = null;
  knownMailIds = new Set();
  showEmpty();
}

/**
 * 点击邮件条目，加载并显示详情
 * @param {number} msgId
 */
async function handleMailClick(msgId) {
  if (!currentEmail) return;
  const { login, domain } = parseEmail(currentEmail);
  try {
    const msg = await apiReadMessage(login, domain, msgId);
    showDetail(msg);
  } catch (e) {
    showError(e.message);
  }
}

/**
 * 从详情视图返回主视图
 */
function handleBack() {
  showMain(currentEmail);
}

/**
 * 自动将邮箱地址填入当前标签页的输入框（F-05）
 */
async function handleAutoFill() {
  if (!currentEmail) return;
  try {
    // 获取当前激活标签页
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) { showError(t('error_no_input')); return; }

    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'fillEmail',
      email:  currentEmail
    });

    if (response && response.success) {
      showToast(t('auto_fill_success'));
    } else {
      showError(t('error_no_input'));
    }
  } catch {
    // content script 未注入（例如 chrome:// 页面）
    showError(t('error_no_input'));
  }
}

/* ── 初始化入口 ──────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化语言并应用翻译
  initLang();
  applyI18n();

  // 绑定按钮事件
  $('btn-generate').addEventListener('click', handleGenerate);
  $('btn-copy').addEventListener('click',     handleCopy);
  $('btn-refresh').addEventListener('click',  handleRefresh);
  $('btn-discard').addEventListener('click',  handleDiscard);
  $('btn-autofill').addEventListener('click', handleAutoFill);
  $('btn-back').addEventListener('click',     handleBack);

  // 从 storage 恢复上次的邮箱
  currentEmail = await readSavedEmail();

  if (currentEmail) {
    showMain(currentEmail);
    setMailStatus(t('loading'));
    await loadMessages(currentEmail);
    startPolling(currentEmail); // 恢复轮询
  } else {
    showEmpty();
  }
});

// 弹窗关闭时自动清理轮询（pagehide 在 Chrome MV3 中更可靠）
window.addEventListener('pagehide', stopPolling);
