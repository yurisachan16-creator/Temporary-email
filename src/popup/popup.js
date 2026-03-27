/**
 * popup.js — TempMail+ 弹窗逻辑（v2.0）
 *
 * 依赖（按 HTML 加载顺序）：
 *   browser-polyfill.min.js → 提供 browser.* Promise API（兼容三端）
 *   dompurify.min.js        → 提供 DOMPurify，用于邮件 HTML 消毒
 *   translations.js         → 提供 window.TRANSLATIONS 语言包
 *
 * 新增功能（v2.0）：
 *   F-10 多邮箱管理（最多 5 个，选项卡切换，各自独立轮询）
 *   F-13 深色模式（跟随系统 / 手动切换，防 FOUC）
 */

'use strict';

/* ── 常量 ───────────────────────────────────────────── */
const API_BASE         = 'https://www.1secmail.com/api/v1/';
const KEY_MAILBOXES    = 'mailboxes';        // v2.0 多邮箱对象数组
const KEY_ACTIVE_MB    = 'activeMailboxId';  // v2.0 激活邮箱 ID
const KEY_LEGACY_EMAIL = 'currentEmail';     // v1.x 兼容键（迁移用）
const KEY_THEME        = 'theme';            // v2.0 主题偏好
const POLL_INTERVAL    = 10_000;             // 轮询间隔（毫秒）
const MAX_MAILBOXES    = 5;                  // PRD 限制

/* ── 运行时状态 ──────────────────────────────────────── */
let mailboxes       = [];          // 邮箱对象数组 { id, address, label, createdAt, provider }
let activeMailboxId = null;        // 当前激活邮箱 ID
const pollTimers    = new Map();   // mailboxId → setInterval ID
const pollingInFlight = new Set(); // 正在执行中的轮询请求，防止并发堆积
const knownMailIds  = new Map();   // mailboxId → Set<messageId>（检测新邮件用）
let currentLang     = 'zh';       // 当前语言

/* ── 工具函数 ─────────────────────────────────────────── */

/** 通过 ID 获取 DOM 元素 */
function $(id) { return document.getElementById(id); }

/** 将邮箱地址拆分为 login 和 domain */
function parseEmail(email) {
  const [login, domain] = email.split('@');
  return { login, domain };
}

/** HTML 特殊字符转义（防止列表渲染 XSS） */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 生成简单唯一 ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ── 国际化 ──────────────────────────────────────────── */

/** 初始化语言：读取浏览器语言，匹配 zh / en，默认 zh */
function initLang() {
  const nav = (navigator.language || 'zh').toLowerCase();
  currentLang = nav.startsWith('en') ? 'en' : 'zh';
}

/** 翻译键值查询 */
function t(key) {
  const translations = window.TRANSLATIONS || {};
  const pack     = translations[currentLang] || {};
  const fallback = translations['en']        || {};
  if (key in pack)     return pack[key];
  if (key in fallback) return fallback[key];
  return key;
}

/** 将页面中所有 [data-i18n] 元素的文本替换为对应翻译 */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  const emptyDesc = $('empty-desc');
  if (emptyDesc) emptyDesc.textContent = t('empty_desc');
}

/* ── 主题管理（F-13）────────────────────────────────── */

/**
 * 将主题变化应用到 DOM，同时镜像写入 localStorage
 * localStorage 供下次打开时防 FOUC（头部内联脚本使用）
 */
function applyTheme(theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('tm_theme', theme);

  // 更新设置视图中的激活按钮
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === theme);
  });
}

/** 从 storage 读取主题并应用 */
async function loadTheme() {
  const result = await browser.storage.local.get(KEY_THEME);
  applyTheme(result[KEY_THEME] || 'auto');
}

/** 保存主题并立即应用 */
async function saveTheme(theme) {
  await browser.storage.local.set({ [KEY_THEME]: theme });
  applyTheme(theme);
}

/* ── API 调用 ─────────────────────────────────────────── */

/** 生成随机临时邮箱地址 */
async function apiGenerateEmail() {
  const res = await fetch(`${API_BASE}?action=genRandomMailbox&count=1`);
  if (!res.ok) throw new Error(`${t('error_network')}（${res.status}）`);
  const [email] = await res.json();
  return email;
}

/** 获取指定邮箱的收件列表 */
async function apiGetMessages(login, domain) {
  const res = await fetch(
    `${API_BASE}?action=getMessages&login=${login}&domain=${domain}`
  );
  if (!res.ok) throw new Error(`${t('error_network')}（${res.status}）`);
  return res.json();
}

/** 读取单封邮件完整内容 */
async function apiReadMessage(login, domain, msgId) {
  const res = await fetch(
    `${API_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`
  );
  if (!res.ok) throw new Error(`${t('error_network')}（${res.status}）`);
  return res.json();
}

/* ── Storage ──────────────────────────────────────────── */

/** 将当前 mailboxes 数组持久化 */
async function persistMailboxes() {
  await browser.storage.local.set({ [KEY_MAILBOXES]: mailboxes });
}

/** 将激活 ID 持久化 */
async function persistActiveId(id) {
  await browser.storage.local.set({ [KEY_ACTIVE_MB]: id });
}

/* ── Toast & 错误提示 ─────────────────────────────────── */

let toastTimer = null;

/** 显示 Toast 提示，2 秒后自动消失 */
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

/** 在底部横幅显示错误信息，3 秒后自动消失 */
function showError(message) {
  const el = $('view-error');
  el.hidden      = false;
  el.textContent = `⚠ ${message}`;
  setTimeout(() => { el.hidden = true; }, 3000);
}

/* ── UI 视图切换 ────────────────────────────────────────── */

/** 显示空状态视图 */
function showEmpty() {
  $('view-empty').hidden    = false;
  $('view-main').hidden     = true;
  $('view-detail').hidden   = true;
  $('view-settings').hidden = true;
  $('view-error').hidden    = true;
  stopAllPolling();
}

/** 显示主视图（传入当前激活的邮箱对象） */
function showMain(mailbox) {
  $('view-empty').hidden    = true;
  $('view-main').hidden     = false;
  $('view-detail').hidden   = true;
  $('view-settings').hidden = true;

  if (!mailbox) return;

  // 更新邮箱地址栏
  const el = $('email-address');
  el.textContent = mailbox.address;
  el.title       = mailbox.address;

  // 重新渲染选项卡
  renderTabs();
}

/** 显示邮件详情视图 */
function showDetail(msg) {
  $('view-empty').hidden    = true;
  $('view-main').hidden     = true;
  $('view-detail').hidden   = false;
  $('view-settings').hidden = true;

  $('detail-subject').textContent = msg.subject || t('no_subject');
  $('detail-from').textContent    = `${t('mail_from')}: ${msg.from || ''}`;
  $('detail-date').textContent    = `${t('mail_date')}: ${msg.date || ''}`;

  const detailBody = $('detail-body');
  if (msg.htmlBody && msg.htmlBody.trim()) {
    detailBody.innerHTML = DOMPurify.sanitize(msg.htmlBody);
  } else {
    detailBody.textContent = msg.textBody || '';
  }
}

/** 显示设置视图 */
function showSettings() {
  $('view-empty').hidden    = true;
  $('view-main').hidden     = true;
  $('view-detail').hidden   = true;
  $('view-settings').hidden = false;

  // 同步当前主题到按钮激活状态
  const saved = localStorage.getItem('tm_theme') || 'auto';
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === saved);
  });
}

/* ── 选项卡渲染（F-10）───────────────────────────────── */

/** 根据 mailboxes 数组重新渲染所有选项卡 */
function renderTabs() {
  const container = $('mailbox-tabs');
  container.innerHTML = '';

  mailboxes.forEach(mb => {
    const tab = document.createElement('div');
    tab.className = 'mailbox-tab' + (mb.id === activeMailboxId ? ' active' : '');
    tab.dataset.id = mb.id;

    // 显示标签：有 label 用 label，否则用邮箱用户名部分
    const displayName = mb.label || mb.address.split('@')[0];

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = displayName;
    nameSpan.title = mb.address;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';
    closeBtn.dataset.id = mb.id;

    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);

    // 点击选项卡主体区域 → 切换邮箱
    tab.addEventListener('click', e => {
      if (!e.target.classList.contains('tab-close')) {
        switchToMailbox(mb.id);
      }
    });

    // 点击 ✕ → 删除邮箱
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      handleDeleteMailbox(mb.id);
    });

    container.appendChild(tab);
  });

  // 更新「＋」按钮状态
  const addBtn  = $('btn-new-mailbox');
  const atLimit = mailboxes.length >= MAX_MAILBOXES;
  addBtn.disabled = atLimit;
  addBtn.title    = atLimit ? t('mailbox_limit') : t('new_mailbox');
}

/* ── 邮件列表渲染 ───────────────────────────────────────── */

/** 在邮件列表区域展示状态文字 */
function setMailStatus(text, isError = false) {
  $('mail-list').innerHTML =
    `<div class="state-text${isError ? ' is-error' : ''}">${escHtml(text)}</div>`;
}

/** 将收件列表渲染到 DOM，并检测新邮件 */
function renderMessages(mailboxId, messages) {
  if (messages.length === 0) {
    setMailStatus(t('no_mail'));
    return;
  }

  const newIds = messages.map(m => m.id);
  const prev   = knownMailIds.get(mailboxId) || new Set();
  const hasNew = newIds.some(id => !prev.has(id));

  // 首次加载（prev 为空）不触发 Toast，后续轮询有新邮件才提示
  if (hasNew && prev.size > 0) {
    showToast(t('new_mail'));
  }
  knownMailIds.set(mailboxId, new Set(newIds));

  $('mail-list').innerHTML = messages.map(msg => `
    <div class="mail-item" data-id="${msg.id}" role="button" tabindex="0">
      <div class="mail-from">${escHtml(msg.from)}</div>
      <div class="mail-subject">${escHtml(msg.subject || t('no_subject'))}</div>
      <div class="mail-date">${escHtml(msg.date)}</div>
    </div>
  `).join('');

  $('mail-list').querySelectorAll('.mail-item').forEach(item => {
    item.addEventListener('click', () => handleMailClick(Number(item.dataset.id)));
  });
}

/* ── 轮询管理（F-10 每个邮箱独立轮询）────────────────── */

/** 为指定邮箱启动轮询 */
function startPolling(id) {
  stopPolling(id); // 防止重复启动
  const mailbox = mailboxes.find(m => m.id === id);
  if (!mailbox) return;

  // 仅对激活邮箱显示状态指示器
  if (id === activeMailboxId) $('poll-indicator').hidden = false;

  const timer = setInterval(async () => {
    // 若上一次请求尚未完成，跳过本次 tick，避免并发堆积
    if (pollingInFlight.has(id)) return;

    // 确认邮箱仍在列表中（防止已被删除后仍触发）
    const current = mailboxes.find(m => m.id === id);
    if (!current) { stopPolling(id); return; }

    pollingInFlight.add(id);
    const { login, domain } = parseEmail(current.address);
    try {
      const messages = await apiGetMessages(login, domain);
      if (id === activeMailboxId) {
        renderMessages(id, messages);
      } else {
        // 非激活邮箱静默更新已知邮件集合
        knownMailIds.set(id, new Set(messages.map(m => m.id)));
      }
    } catch {
      if (id === activeMailboxId) {
        setMailStatus(t('error_network'), true);
      }
    } finally {
      pollingInFlight.delete(id);
    }
  }, POLL_INTERVAL);

  pollTimers.set(id, timer);
}

/** 停止指定邮箱的轮询 */
function stopPolling(id) {
  if (pollTimers.has(id)) {
    clearInterval(pollTimers.get(id));
    pollTimers.delete(id);
  }
  pollingInFlight.delete(id);
  if (id === activeMailboxId) {
    const indicator = $('poll-indicator');
    if (indicator) indicator.hidden = true;
  }
}

/** 停止所有邮箱的轮询 */
function stopAllPolling() {
  pollTimers.forEach(timer => clearInterval(timer));
  pollTimers.clear();
  pollingInFlight.clear();
  const indicator = $('poll-indicator');
  if (indicator) indicator.hidden = true;
}

/* ── 加载收件箱 ─────────────────────────────────────────── */

/** 加载并渲染指定邮箱的收件列表 */
async function loadMessages(mailbox) {
  if (!mailbox) return;
  const { login, domain } = parseEmail(mailbox.address);
  try {
    const messages = await apiGetMessages(login, domain);
    // 仅当该邮箱仍为激活邮箱时才更新 DOM
    if (mailbox.id === activeMailboxId) {
      renderMessages(mailbox.id, messages);
    }
  } catch (e) {
    if (mailbox.id === activeMailboxId) {
      setMailStatus(e.message, true);
    }
  }
}

/* ── 邮箱管理操作（F-10）────────────────────────────── */

/** 切换到指定邮箱（更新状态、渲染 UI、加载收件） */
async function switchToMailbox(id) {
  activeMailboxId = id;
  await persistActiveId(id);

  const mailbox = mailboxes.find(m => m.id === id);
  if (!mailbox) return;

  showMain(mailbox);
  setMailStatus(t('loading'));
  await loadMessages(mailbox);
  startPolling(id);
}

/** 将新邮箱加入列表并自动切换到该邮箱 */
async function addNewMailbox(address, label) {
  const mailbox = {
    id:        generateId(),
    address,
    label:     String(label || '').slice(0, 20),
    createdAt: Date.now(),
    provider:  '1secmail',
  };
  mailboxes.push(mailbox);
  knownMailIds.set(mailbox.id, new Set());
  await persistMailboxes();
  await switchToMailbox(mailbox.id);
}

/* ── 事件处理器 ─────────────────────────────────────────── */

/** 「生成」按钮：在空状态创建第一个邮箱 */
async function handleGenerate() {
  const btn = $('btn-generate');
  btn.disabled    = true;
  btn.textContent = t('loading');

  try {
    const email = await apiGenerateEmail();
    await addNewMailbox(email, '');
  } catch (e) {
    showError(e.message);
    btn.disabled    = false;
    btn.textContent = t('generate');
  }
}

/** 「＋」按钮：展开新建邮箱表单 */
function handleNewMailbox() {
  const form  = $('new-mailbox-form');
  const input = $('mailbox-label-input');
  form.hidden       = false;
  input.placeholder = t('label_placeholder');
  input.value       = '';
  input.focus();
}

/** 「生成」按钮（表单内）：生成新邮箱并关闭表单 */
async function handleConfirmNew() {
  const btn   = $('btn-confirm-new');
  const label = $('mailbox-label-input').value.trim();

  btn.disabled    = true;
  btn.textContent = t('generating');

  try {
    const email = await apiGenerateEmail();
    $('new-mailbox-form').hidden = true;
    await addNewMailbox(email, label);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = t('confirm_new');
  }
}

/** 「取消」按钮（表单内）：关闭新建表单 */
function handleCancelNew() {
  $('new-mailbox-form').hidden   = true;
  $('mailbox-label-input').value = '';
}

/** 删除邮箱（点击选项卡上的 ✕） */
async function handleDeleteMailbox(id) {
  if (!confirm(t('delete_mailbox_confirm'))) return;

  stopPolling(id);
  knownMailIds.delete(id);

  const idx = mailboxes.findIndex(m => m.id === id);
  if (idx !== -1) mailboxes.splice(idx, 1);

  await persistMailboxes();

  if (mailboxes.length === 0) {
    // 所有邮箱已删除，回到空状态
    activeMailboxId = null;
    await persistActiveId(null);
    showEmpty();
    return;
  }

  if (id === activeMailboxId) {
    // 删除的是当前激活邮箱，切换到列表第一个
    await switchToMailbox(mailboxes[0].id);
  } else {
    // 删除非激活邮箱，仅刷新选项卡
    renderTabs();
  }
}

/** 复制邮箱地址到剪贴板 */
async function handleCopy() {
  const mailbox = mailboxes.find(m => m.id === activeMailboxId);
  if (!mailbox) return;
  try {
    await navigator.clipboard.writeText(mailbox.address);
    const btn  = $('btn-copy');
    const orig = btn.textContent;
    btn.textContent = t('copied');
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    showError(t('error_network'));
  }
}

/** 刷新当前邮箱的收件列表 */
async function handleRefresh() {
  const mailbox = mailboxes.find(m => m.id === activeMailboxId);
  if (!mailbox) return;
  setMailStatus(t('loading'));
  await loadMessages(mailbox);
}

/** 丢弃当前邮箱（等同于删除当前激活邮箱） */
async function handleDiscard() {
  if (activeMailboxId) {
    await handleDeleteMailbox(activeMailboxId);
  }
}

/** 点击邮件条目，加载并显示详情 */
async function handleMailClick(msgId) {
  const mailbox = mailboxes.find(m => m.id === activeMailboxId);
  if (!mailbox) return;
  const { login, domain } = parseEmail(mailbox.address);
  try {
    const msg = await apiReadMessage(login, domain, msgId);
    showDetail(msg);
  } catch (e) {
    showError(e.message);
  }
}

/** 从详情视图返回主视图 */
function handleBack() {
  const mailbox = mailboxes.find(m => m.id === activeMailboxId);
  if (mailbox) showMain(mailbox);
}

/** 自动填入当前邮箱地址到页面输入框 */
async function handleAutoFill() {
  const mailbox = mailboxes.find(m => m.id === activeMailboxId);
  if (!mailbox) return;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) { showError(t('error_no_input')); return; }

    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'fillEmail',
      email:  mailbox.address,
    });

    if (response && response.success) {
      showToast(t('auto_fill_success'));
    } else {
      showError(t('error_no_input'));
    }
  } catch {
    showError(t('error_no_input'));
  }
}

/** 打开设置视图 */
function handleOpenSettings() {
  showSettings();
}

/** 从设置视图返回（回到主视图或空状态） */
function handleSettingsBack() {
  const mailbox = mailboxes.find(m => m.id === activeMailboxId);
  if (mailbox) {
    showMain(mailbox);
  } else {
    showEmpty();
  }
}

/* ── v1.x → v2.0 数据迁移 ───────────────────────────── */

/**
 * 检查是否存在 v1.x 的 currentEmail 数据，若有则迁移到新格式
 * 迁移完成后清除旧键
 */
async function migrateFromV1() {
  const result = await browser.storage.local.get(KEY_LEGACY_EMAIL);
  const legacy = result[KEY_LEGACY_EMAIL];
  if (!legacy || mailboxes.length > 0) return; // 无需迁移

  const mailbox = {
    id:        generateId(),
    address:   legacy,
    label:     '',
    createdAt: Date.now(),
    provider:  '1secmail',
  };
  mailboxes.push(mailbox);
  activeMailboxId = mailbox.id;
  knownMailIds.set(mailbox.id, new Set());

  await browser.storage.local.set({
    [KEY_MAILBOXES]: mailboxes,
    [KEY_ACTIVE_MB]: activeMailboxId,
  });
  await browser.storage.local.remove(KEY_LEGACY_EMAIL);
}

/* ── 初始化入口 ──────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化语言并应用翻译
  initLang();
  applyI18n();

  // 绑定按钮事件
  $('btn-generate').addEventListener('click',      handleGenerate);
  $('btn-new-mailbox').addEventListener('click',   handleNewMailbox);
  $('btn-confirm-new').addEventListener('click',   handleConfirmNew);
  $('btn-cancel-new').addEventListener('click',    handleCancelNew);
  $('btn-copy').addEventListener('click',          handleCopy);
  $('btn-refresh').addEventListener('click',       handleRefresh);
  $('btn-discard').addEventListener('click',       handleDiscard);
  $('btn-autofill').addEventListener('click',      handleAutoFill);
  $('btn-back').addEventListener('click',          handleBack);
  $('btn-settings').addEventListener('click',      handleOpenSettings);
  $('btn-settings-back').addEventListener('click', handleSettingsBack);

  // 绑定主题切换按钮
  $('theme-options').querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => saveTheme(btn.dataset.value));
  });

  // 加载已保存的主题
  await loadTheme();

  // 从 storage 加载邮箱列表
  const stored = await browser.storage.local.get([KEY_MAILBOXES, KEY_ACTIVE_MB]);
  mailboxes       = stored[KEY_MAILBOXES] ?? [];
  activeMailboxId = stored[KEY_ACTIVE_MB] ?? null;

  // v1.x → v2.0 数据迁移
  await migrateFromV1();

  // 初始化每个邮箱的已知邮件集合
  mailboxes.forEach(mb => {
    if (!knownMailIds.has(mb.id)) knownMailIds.set(mb.id, new Set());
  });

  if (mailboxes.length === 0) {
    showEmpty();
    return;
  }

  // 确保激活 ID 指向有效邮箱
  if (!mailboxes.find(m => m.id === activeMailboxId)) {
    activeMailboxId = mailboxes[0].id;
    await persistActiveId(activeMailboxId);
  }

  // 展示主视图并加载当前邮箱的收件
  const active = mailboxes.find(m => m.id === activeMailboxId);
  showMain(active);
  setMailStatus(t('loading'));
  await loadMessages(active);

  // 为所有邮箱启动独立轮询
  mailboxes.forEach(mb => startPolling(mb.id));
});

// 弹窗关闭时停止所有轮询（pagehide 在 Chrome MV3 中更可靠）
window.addEventListener('pagehide', stopAllPolling);
