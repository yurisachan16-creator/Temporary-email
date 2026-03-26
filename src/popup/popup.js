/**
 * popup.js — TempMail+ 弹窗逻辑（v0.1 原型版）
 *
 * 直接使用 chrome.* API（v1.0 将迁移至 webextension-polyfill）
 * 主要流程：
 *   1. 弹窗打开 → 读取已保存的邮箱
 *   2. 无邮箱  → 显示"生成"按钮
 *   3. 有邮箱  → 显示邮箱地址并加载收件列表
 */

'use strict';

/* ── API 常量 ──────────────────────────────────────── */
const API_BASE    = 'https://www.1secmail.com/api/v1/';
const STORAGE_KEY = 'currentEmail'; // 与 storage.js 保持一致

/* ── 工具函数 ─────────────────────────────────────── */

/**
 * 将邮箱地址拆分为 login 和 domain
 * @param {string} email
 * @returns {{ login: string, domain: string }}
 */
function parseEmail(email) {
  const [login, domain] = email.split('@');
  return { login, domain };
}

/**
 * 转义 HTML 特殊字符，防止 XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ── API 调用 ─────────────────────────────────────── */

/**
 * 调用 1secmail API 生成随机临时邮箱
 * @returns {Promise<string>} 邮箱地址
 */
async function apiGenerateEmail() {
  const res = await fetch(`${API_BASE}?action=genRandomMailbox&count=1`);
  if (!res.ok) throw new Error(`生成失败（${res.status}）`);
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
  if (!res.ok) throw new Error(`获取收件失败（${res.status}）`);
  return res.json();
}

/* ── Storage 操作（chrome.storage.local）─────────── */

/**
 * 读取已保存的邮箱地址
 * @returns {Promise<string|null>}
 */
function readSavedEmail() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      resolve(result[STORAGE_KEY] || null);
    });
  });
}

/**
 * 持久化保存邮箱地址
 * @param {string} email
 * @returns {Promise<void>}
 */
function persistEmail(email) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: email }, resolve);
  });
}

/**
 * 清除已保存的邮箱地址
 * @returns {Promise<void>}
 */
function eraseEmail() {
  return new Promise(resolve => {
    chrome.storage.local.remove(STORAGE_KEY, resolve);
  });
}

/* ── UI 状态管理 ──────────────────────────────────── */

/** 当前使用的邮箱地址（null 表示未生成） */
let currentEmail = null;

/**
 * 显示空状态视图（无邮箱）
 */
function showEmpty() {
  $('view-empty').hidden = false;
  $('view-main').hidden  = true;
  $('view-error').hidden = true;
  $('btn-generate').disabled    = false;
  $('btn-generate').textContent = '生成临时邮箱';
}

/**
 * 显示主视图（已有邮箱）
 * @param {string} email
 */
function showMain(email) {
  $('view-empty').hidden = true;
  $('view-main').hidden  = false;
  // 将邮箱地址写入地址栏，同时设置 title 方便悬停查看
  const el = $('email-address');
  el.textContent = email;
  el.title       = email;
}

/**
 * 在顶部横幅显示错误信息（3 秒后自动消失）
 * @param {string} message
 */
function showError(message) {
  const el = $('view-error');
  el.hidden      = false;
  el.textContent = `⚠ ${message}`;
  setTimeout(() => { el.hidden = true; }, 3000);
}

/**
 * 在邮件列表区域展示状态文字（加载中、空状态、错误）
 * @param {string} text
 * @param {'normal'|'error'} [type='normal']
 */
function setMailStatus(text, type = 'normal') {
  $('mail-list').innerHTML =
    `<div class="state-text${type === 'error' ? ' is-error' : ''}">${escapeHtml(text)}</div>`;
}

/**
 * 将收件列表渲染到 DOM
 * @param {Array} messages
 */
function renderMessages(messages) {
  if (messages.length === 0) {
    setMailStatus('暂无邮件，等待收件中...');
    return;
  }

  $('mail-list').innerHTML = messages.map(msg => `
    <div class="mail-item">
      <div class="mail-from">${escapeHtml(msg.from)}</div>
      <div class="mail-subject">${escapeHtml(msg.subject || '（无主题）')}</div>
      <div class="mail-date">${escapeHtml(msg.date)}</div>
    </div>
  `).join('');
}

/* ── 事件处理器 ───────────────────────────────────── */

/**
 * 生成新临时邮箱
 */
async function handleGenerate() {
  // 禁用按钮防止重复点击
  const btn = $('btn-generate');
  btn.disabled    = true;
  btn.textContent = '生成中...';

  try {
    const email = await apiGenerateEmail();
    await persistEmail(email);
    currentEmail = email;
    showMain(email);
    await loadMessages(email);
  } catch (e) {
    showError(e.message);
    btn.disabled    = false;
    btn.textContent = '生成临时邮箱';
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
    btn.textContent = '已复制 ✓';
    // 2 秒后恢复按钮文字
    setTimeout(() => { btn.textContent = '复制'; }, 2000);
  } catch {
    showError('复制失败，请手动选择地址');
  }
}

/**
 * 刷新收件列表
 */
async function handleRefresh() {
  if (!currentEmail) return;
  await loadMessages(currentEmail);
}

/**
 * 丢弃当前邮箱并回到空状态
 */
async function handleDiscard() {
  await eraseEmail();
  currentEmail = null;
  showEmpty();
}

/**
 * 加载并渲染指定邮箱的收件列表
 * @param {string} email
 */
async function loadMessages(email) {
  setMailStatus('加载中...');
  const { login, domain } = parseEmail(email);
  try {
    const messages = await apiGetMessages(login, domain);
    renderMessages(messages);
  } catch (e) {
    setMailStatus(e.message, 'error');
  }
}

/* ── 初始化 ───────────────────────────────────────── */

/**
 * 简写：通过 ID 获取 DOM 元素
 * @param {string} id
 * @returns {HTMLElement}
 */
function $(id) {
  return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', async () => {
  // 绑定按钮事件
  $('btn-generate').addEventListener('click', handleGenerate);
  $('btn-copy').addEventListener('click',     handleCopy);
  $('btn-refresh').addEventListener('click',  handleRefresh);
  $('btn-discard').addEventListener('click',  handleDiscard);

  // 从 storage 恢复上次的邮箱
  currentEmail = await readSavedEmail();

  if (currentEmail) {
    showMain(currentEmail);
    await loadMessages(currentEmail);
  } else {
    showEmpty();
  }
});
