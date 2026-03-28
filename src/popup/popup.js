/**
 * popup.js — TempMail+ 弹窗逻辑（共享服务版）
 *
 * 依赖：
 *   - browser-polyfill：提供 browser.* Promise API
 *   - DOMPurify：消毒邮件 HTML
 *   - translations.js：注入 window.TRANSLATIONS
 */

import {
  PROVIDERS,
  generateMailbox,
  getMailboxMessages,
  readMailboxMessage,
  discardMailboxSession,
  getDomainTierLabel,
} from '../api/mailService.js';
import {
  getAllMailboxes,
  addMailbox,
  removeMailbox,
  getActiveMailboxId,
  setActiveMailboxId,
  getTheme,
  setTheme,
  getLanguage,
  setLanguage,
  getProviderSession,
  setProviderSession,
  clearProviderSession,
} from '../utils/storage.js';
import {
  resolveDisplayLanguage,
  createTranslator,
  applyTranslations,
} from './i18n.js';

/* ── 常量 ───────────────────────────────────────────── */
const KEY_LEGACY_EMAIL = 'currentEmail'; // v1.x 兼容键（迁移用）
const POLL_INTERVAL    = 10_000;
const MAX_MAILBOXES    = 5;

/* ── 运行时状态 ──────────────────────────────────────── */
let mailboxes            = [];
let activeMailboxId      = null;
let currentLangPreference = 'auto';
let currentLang          = 'zh';
let currentDetailMessage = null;
let copyResetTimer       = null;
let toastTimer           = null;
let errorTimer           = null;

const pollTimers       = new Map();
const pollingInFlight  = new Set();
const knownMailIds     = new Map();
const currentMessages  = new Map();
const providerSessions = new Map();

/* ── 工具函数 ─────────────────────────────────────────── */

/**
 * 通过 ID 获取元素
 * @param {string} id
 * @returns {HTMLElement}
 */
function $(id) { return document.getElementById(id); }

/**
 * 获取当前激活邮箱对象
 * @returns {object|null}
 */
function getActiveMailbox() {
  return mailboxes.find((mailbox) => mailbox.id === activeMailboxId) || null;
}

/**
 * 解析邮箱地址
 * @param {string} email
 * @returns {{login:string,domain:string}}
 */
function parseEmail(email) {
  const [login = '', domain = ''] = String(email || '').split('@');
  return { login, domain };
}

/**
 * HTML 转义，避免列表渲染 XSS
 * @param {string} value
 * @returns {string}
 */
function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 生成唯一 ID
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * 当前翻译函数
 * @param {string} key
 * @returns {string}
 */
function t(key) {
  const translate = createTranslator(window.TRANSLATIONS || {}, currentLang);
  return translate(key);
}

/**
 * 将 provider 标准化为存储用值
 * @param {string} provider
 * @returns {string}
 */
function normalizeProvider(provider) {
  return provider === PROVIDERS.mailTm || provider === 'mail.tm'
    ? PROVIDERS.mailTm
    : PROVIDERS.oneSecMail;
}

/* ── 国际化 ──────────────────────────────────────────── */

/**
 * 解析并写入当前展示语言
 * @returns {void}
 */
function resolveCurrentLanguage() {
  currentLang = resolveDisplayLanguage(currentLangPreference, navigator.language || 'zh');
  document.documentElement.lang = currentLang;
}

/**
 * 更新语言选择按钮激活态
 * @returns {void}
 */
function syncLanguageButtons() {
  document.querySelectorAll('.language-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === currentLangPreference);
  });
}

/**
 * 将当前语言刷新到界面
 * @returns {void}
 */
function applyI18n() {
  resolveCurrentLanguage();
  applyTranslations(document, t);
  syncLanguageButtons();

  const activeMailbox = getActiveMailbox();
  const badge = $('domain-badge');
  if (badge && activeMailbox) {
    const domain = parseEmail(activeMailbox.address).domain;
    const label = getDomainTierLabel(domain, currentLang);
    badge.textContent = label;
    badge.title = label;
  }

  if (!copyResetTimer) {
    $('btn-copy').textContent = t('copy');
  }

  if (!$('new-mailbox-form').hidden) {
    $('mailbox-label-input').placeholder = t('label_placeholder');
  }

  if ($('view-detail').hidden === false && currentDetailMessage) {
    showDetail(currentDetailMessage);
    return;
  }

  if ($('view-settings').hidden === false) {
    showSettings();
    return;
  }

  if ($('view-main').hidden === false) {
    const messages = currentMessages.get(activeMailboxId);
    showMain(activeMailbox);
    if (messages) {
      renderMessages(activeMailboxId, messages);
    }
    return;
  }

  showEmpty();
}

/**
 * 保存语言偏好并立即刷新界面
 * @param {'auto'|'zh'|'en'} language
 * @returns {Promise<void>}
 */
async function saveLanguagePreference(language) {
  currentLangPreference = language;
  await setLanguage(language);
  applyI18n();
}

/* ── 主题管理 ────────────────────────────────────────── */

/**
 * 将主题应用到 DOM 并镜像到 localStorage
 * @param {'auto'|'light'|'dark'} theme
 * @returns {void}
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

  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === theme);
  });
}

/* ── Storage 与会话 ─────────────────────────────────── */

/**
 * 迁移 v1.x 单邮箱数据到 v2.0 结构
 * @returns {Promise<void>}
 */
async function migrateFromV1() {
  const result = await browser.storage.local.get(KEY_LEGACY_EMAIL);
  const legacyEmail = result[KEY_LEGACY_EMAIL];

  if (!legacyEmail || mailboxes.length > 0) return;

  const mailbox = {
    id:        generateId(),
    address:   legacyEmail,
    label:     '',
    createdAt: Date.now(),
    provider:  PROVIDERS.oneSecMail,
  };

  mailboxes.push(mailbox);
  activeMailboxId = mailbox.id;
  knownMailIds.set(mailbox.id, new Set());
  currentMessages.set(mailbox.id, []);

  await browser.storage.local.set({
    mailboxes,
    activeMailboxId,
  });
  await browser.storage.local.remove(KEY_LEGACY_EMAIL);
}

/**
 * 加载所有 provider 会话到内存映射
 * @returns {Promise<void>}
 */
async function loadProviderSessions() {
  providerSessions.clear();

  await Promise.all(mailboxes.map(async (mailbox) => {
    const session = await getProviderSession(mailbox.address);
    if (session) {
      providerSessions.set(mailbox.address, session);
    }
  }));
}

/**
 * 读取指定邮箱的 provider 会话
 * @param {object} mailbox
 * @returns {object|null}
 */
function readProviderSession(mailbox) {
  return providerSessions.get(mailbox.address) || null;
}

/**
 * 持久化并缓存指定邮箱的 provider 会话
 * @param {string} address
 * @param {object|null} session
 * @returns {Promise<void>}
 */
async function persistProviderSession(address, session) {
  if (!session) return;
  providerSessions.set(address, session);
  await setProviderSession(address, session);
}

/**
 * 清除指定邮箱的 provider 会话
 * @param {string} address
 * @returns {Promise<void>}
 */
async function eraseProviderSession(address) {
  providerSessions.delete(address);
  await clearProviderSession(address);
}

/* ── Toast 与错误提示 ───────────────────────────────── */

/**
 * 显示 Toast 提示
 * @param {string} message
 * @returns {void}
 */
function showToast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 2000);
}

/**
 * 显示错误横幅
 * @param {string} message
 * @returns {void}
 */
function showError(message) {
  const element = $('view-error');
  element.hidden = false;
  element.textContent = `⚠ ${message}`;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { element.hidden = true; }, 3500);
}

/* ── 视图切换 ───────────────────────────────────────── */

/**
 * 显示空状态
 * @returns {void}
 */
function showEmpty() {
  $('view-empty').hidden = false;
  $('view-main').hidden = true;
  $('view-detail').hidden = true;
  $('view-settings').hidden = true;
  $('view-error').hidden = true;
  currentDetailMessage = null;
  stopAllPolling();
}

/**
 * 显示主视图
 * @param {object|null} mailbox
 * @returns {void}
 */
function showMain(mailbox) {
  $('view-empty').hidden = true;
  $('view-main').hidden = false;
  $('view-detail').hidden = true;
  $('view-settings').hidden = true;
  currentDetailMessage = null;

  if (!mailbox) return;

  const emailAddress = $('email-address');
  emailAddress.textContent = mailbox.address;
  emailAddress.title = mailbox.address;

  const domain = parseEmail(mailbox.address).domain;
  const domainBadge = $('domain-badge');
  const tierLabel = getDomainTierLabel(domain, currentLang);
  domainBadge.textContent = tierLabel;
  domainBadge.title = tierLabel;

  renderTabs();
}

/**
 * 显示邮件详情
 * @param {object} message
 * @returns {void}
 */
function showDetail(message) {
  $('view-empty').hidden = true;
  $('view-main').hidden = true;
  $('view-detail').hidden = false;
  $('view-settings').hidden = true;
  currentDetailMessage = message;

  $('detail-subject').textContent = message.subject || t('no_subject');
  $('detail-from').textContent = `${t('mail_from')}: ${message.from || ''}`;
  $('detail-date').textContent = `${t('mail_date')}: ${message.date || ''}`;

  const detailBody = $('detail-body');
  if (message.htmlBody && message.htmlBody.trim()) {
    detailBody.innerHTML = DOMPurify.sanitize(message.htmlBody);
  } else {
    detailBody.textContent = message.textBody || '';
  }
}

/**
 * 显示设置视图
 * @returns {void}
 */
function showSettings() {
  $('view-empty').hidden = true;
  $('view-main').hidden = true;
  $('view-detail').hidden = true;
  $('view-settings').hidden = false;

  const savedTheme = localStorage.getItem('tm_theme') || 'auto';
  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === savedTheme);
  });
  syncLanguageButtons();
}

/* ── 邮箱选项卡 ─────────────────────────────────────── */

/**
 * 渲染所有邮箱选项卡
 * @returns {void}
 */
function renderTabs() {
  const container = $('mailbox-tabs');
  container.innerHTML = '';

  mailboxes.forEach((mailbox) => {
    const tab = document.createElement('div');
    tab.className = `mailbox-tab${mailbox.id === activeMailboxId ? ' active' : ''}`;
    tab.dataset.id = mailbox.id;

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = mailbox.label || parseEmail(mailbox.address).login;
    name.title = mailbox.address;

    const closeButton = document.createElement('button');
    closeButton.className = 'tab-close';
    closeButton.type = 'button';
    closeButton.textContent = '✕';
    closeButton.title = t('discard');
    closeButton.dataset.id = mailbox.id;

    tab.appendChild(name);
    tab.appendChild(closeButton);

    tab.addEventListener('click', (event) => {
      if (!event.target.classList.contains('tab-close')) {
        void switchToMailbox(mailbox.id);
      }
    });

    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void handleDeleteMailbox(mailbox.id);
    });

    container.appendChild(tab);
  });

  const addButton = $('btn-new-mailbox');
  const atLimit = mailboxes.length >= MAX_MAILBOXES;
  addButton.disabled = atLimit;
  addButton.title = atLimit ? t('mailbox_limit') : t('new_mailbox');
}

/* ── 收件列表 ───────────────────────────────────────── */

/**
 * 设置列表状态文案
 * @param {string} text
 * @param {boolean} [isError]
 * @returns {void}
 */
function setMailStatus(text, isError = false) {
  $('mail-list').innerHTML =
    `<div class="state-text${isError ? ' is-error' : ''}">${escHtml(text)}</div>`;
}

/**
 * 渲染邮件列表
 * @param {string} mailboxId
 * @param {Array<object>} messages
 * @returns {void}
 */
function renderMessages(mailboxId, messages) {
  currentMessages.set(mailboxId, messages);

  if (!messages || messages.length === 0) {
    setMailStatus(t('no_mail'));
    return;
  }

  const newIds = messages.map((message) => String(message.id));
  const previousIds = knownMailIds.get(mailboxId) || new Set();
  const hasNewMail = previousIds.size > 0 && newIds.some((id) => !previousIds.has(id));

  if (hasNewMail) {
    showToast(t('new_mail'));
  }

  knownMailIds.set(mailboxId, new Set(newIds));

  $('mail-list').innerHTML = messages.map((message) => `
    <div class="mail-item" data-id="${message.id}" role="button" tabindex="0">
      <div class="mail-from">${escHtml(message.from)}</div>
      <div class="mail-subject">${escHtml(message.subject || t('no_subject'))}</div>
      <div class="mail-date">${escHtml(message.date)}</div>
    </div>
  `).join('');

  $('mail-list').querySelectorAll('.mail-item').forEach((item) => {
    const openMessage = () => handleMailClick(item.dataset.id);
    item.addEventListener('click', openMessage);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMessage();
      }
    });
  });
}

/* ── 轮询 ───────────────────────────────────────────── */

/**
 * 启动指定邮箱轮询
 * @param {string} mailboxId
 * @returns {void}
 */
function startPolling(mailboxId) {
  stopPolling(mailboxId);

  const mailbox = mailboxes.find((item) => item.id === mailboxId);
  if (!mailbox) return;

  if (mailboxId === activeMailboxId) {
    $('poll-indicator').hidden = false;
  }

  const timer = setInterval(async () => {
    if (pollingInFlight.has(mailboxId)) return;

    const currentMailbox = mailboxes.find((item) => item.id === mailboxId);
    if (!currentMailbox) {
      stopPolling(mailboxId);
      return;
    }

    pollingInFlight.add(mailboxId);
    try {
      const session = readProviderSession(currentMailbox);
      const result = await getMailboxMessages(currentMailbox, session);
      await persistProviderSession(currentMailbox.address, result.session);

      if (mailboxId === activeMailboxId) {
        renderMessages(mailboxId, result.messages);
      } else {
        currentMessages.set(mailboxId, result.messages);
        knownMailIds.set(
          mailboxId,
          new Set(result.messages.map((message) => String(message.id)))
        );
      }
    } catch (error) {
      if (mailboxId === activeMailboxId) {
        setMailStatus(error.message || t('error_network'), true);
      }
    } finally {
      pollingInFlight.delete(mailboxId);
    }
  }, POLL_INTERVAL);

  pollTimers.set(mailboxId, timer);
}

/**
 * 停止指定邮箱轮询
 * @param {string} mailboxId
 * @returns {void}
 */
function stopPolling(mailboxId) {
  if (pollTimers.has(mailboxId)) {
    clearInterval(pollTimers.get(mailboxId));
    pollTimers.delete(mailboxId);
  }

  pollingInFlight.delete(mailboxId);

  if (mailboxId === activeMailboxId) {
    $('poll-indicator').hidden = true;
  }
}

/**
 * 停止全部轮询
 * @returns {void}
 */
function stopAllPolling() {
  pollTimers.forEach((timer) => clearInterval(timer));
  pollTimers.clear();
  pollingInFlight.clear();
  $('poll-indicator').hidden = true;
}

/**
 * 加载指定邮箱收件列表
 * @param {object} mailbox
 * @returns {Promise<void>}
 */
async function loadMessages(mailbox) {
  if (!mailbox) return;

  try {
    const session = readProviderSession(mailbox);
    const result = await getMailboxMessages(mailbox, session);
    await persistProviderSession(mailbox.address, result.session);

    if (mailbox.id === activeMailboxId) {
      renderMessages(mailbox.id, result.messages);
    } else {
      currentMessages.set(mailbox.id, result.messages);
    }
  } catch (error) {
    if (mailbox.id === activeMailboxId) {
      setMailStatus(error.message || t('error_network'), true);
    }
  }
}

/* ── 邮箱管理 ───────────────────────────────────────── */

/**
 * 切换激活邮箱
 * @param {string} mailboxId
 * @returns {Promise<void>}
 */
async function switchToMailbox(mailboxId) {
  activeMailboxId = mailboxId;
  await setActiveMailboxId(mailboxId);

  const mailbox = getActiveMailbox();
  if (!mailbox) return;

  showMain(mailbox);
  setMailStatus(t('loading'));
  await loadMessages(mailbox);
  startPolling(mailboxId);
}

/**
 * 新增邮箱并自动切换
 * @param {{address:string,provider:string,label:string,session:object}} options
 * @returns {Promise<void>}
 */
async function addGeneratedMailbox(options) {
  const mailbox = await addMailbox({
    address:  options.address,
    label:    options.label,
    provider: normalizeProvider(options.provider),
  });

  knownMailIds.set(mailbox.id, new Set());
  currentMessages.set(mailbox.id, []);
  await persistProviderSession(mailbox.address, options.session);
  mailboxes = await getAllMailboxes();
  await switchToMailbox(mailbox.id);
}

/* ── 事件处理 ───────────────────────────────────────── */

/**
 * 生成首个邮箱
 * @returns {Promise<void>}
 */
async function handleGenerate() {
  const button = $('btn-generate');
  button.disabled = true;
  button.textContent = t('loading');

  try {
    const result = await generateMailbox();
    await addGeneratedMailbox({
      address:  result.address,
      provider: result.provider,
      session:  result.session,
      label:    '',
    });
  } catch (error) {
    showError(error.message || t('error_network'));
    button.disabled = false;
    button.textContent = t('generate');
  }
}

/**
 * 打开新建邮箱表单
 * @returns {void}
 */
function handleNewMailbox() {
  $('new-mailbox-form').hidden = false;
  $('mailbox-label-input').placeholder = t('label_placeholder');
  $('mailbox-label-input').value = '';
  $('mailbox-label-input').focus();
}

/**
 * 确认生成新邮箱
 * @returns {Promise<void>}
 */
async function handleConfirmNew() {
  const button = $('btn-confirm-new');
  const label = $('mailbox-label-input').value.trim();

  button.disabled = true;
  button.textContent = t('generating');

  try {
    const result = await generateMailbox();
    $('new-mailbox-form').hidden = true;
    await addGeneratedMailbox({
      address:  result.address,
      provider: result.provider,
      session:  result.session,
      label,
    });
  } catch (error) {
    showError(error.message || t('error_network'));
  } finally {
    button.disabled = false;
    button.textContent = t('confirm_new');
  }
}

/**
 * 取消新建邮箱
 * @returns {void}
 */
function handleCancelNew() {
  $('new-mailbox-form').hidden = true;
  $('mailbox-label-input').value = '';
}

/**
 * 删除指定邮箱
 * @param {string} mailboxId
 * @returns {Promise<void>}
 */
async function handleDeleteMailbox(mailboxId) {
  if (!confirm(t('delete_mailbox_confirm'))) return;

  const mailbox = mailboxes.find((item) => item.id === mailboxId);
  if (!mailbox) return;

  stopPolling(mailboxId);

  try {
    const session = readProviderSession(mailbox);
    await discardMailboxSession(mailbox, session);
  } catch {
    // 远端删除失败不阻塞本地清理
  }

  await eraseProviderSession(mailbox.address);
  currentMessages.delete(mailboxId);
  knownMailIds.delete(mailboxId);
  await removeMailbox(mailboxId);

  mailboxes = await getAllMailboxes();

  if (mailboxes.length === 0) {
    activeMailboxId = null;
    await setActiveMailboxId(null);
    showEmpty();
    return;
  }

  if (mailboxId === activeMailboxId) {
    const nextMailbox = mailboxes[0];
    await switchToMailbox(nextMailbox.id);
  } else {
    renderTabs();
  }
}

/**
 * 复制当前邮箱地址
 * @returns {Promise<void>}
 */
async function handleCopy() {
  const mailbox = getActiveMailbox();
  if (!mailbox) return;

  try {
    await navigator.clipboard.writeText(mailbox.address);
    const button = $('btn-copy');
    button.textContent = t('copied');
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      button.textContent = t('copy');
      copyResetTimer = null;
    }, 2000);
  } catch {
    showError(t('error_network'));
  }
}

/**
 * 手动刷新收件箱
 * @returns {Promise<void>}
 */
async function handleRefresh() {
  const mailbox = getActiveMailbox();
  if (!mailbox) return;

  setMailStatus(t('loading'));
  await loadMessages(mailbox);
}

/**
 * 丢弃当前邮箱
 * @returns {Promise<void>}
 */
async function handleDiscard() {
  if (activeMailboxId) {
    await handleDeleteMailbox(activeMailboxId);
  }
}

/**
 * 打开指定邮件详情
 * @param {string|number} messageId
 * @returns {Promise<void>}
 */
async function handleMailClick(messageId) {
  const mailbox = getActiveMailbox();
  if (!mailbox) return;

  try {
    const session = readProviderSession(mailbox);
    const result = await readMailboxMessage(mailbox, session, messageId);
    await persistProviderSession(mailbox.address, result.session);
    showDetail(result.message);
  } catch (error) {
    showError(error.message || t('error_network'));
  }
}

/**
 * 返回主视图
 * @returns {void}
 */
function handleBack() {
  const mailbox = getActiveMailbox();
  if (mailbox) {
    showMain(mailbox);
    const messages = currentMessages.get(mailbox.id);
    if (messages) {
      renderMessages(mailbox.id, messages);
    }
  }
}

/**
 * 自动填入邮箱
 * @returns {Promise<void>}
 */
async function handleAutoFill() {
  const mailbox = getActiveMailbox();
  if (!mailbox) return;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showError(t('error_no_input'));
      return;
    }

    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'fillEmail',
      email:  mailbox.address,
    });

    if (response?.success) {
      showToast(t('auto_fill_success'));
    } else {
      showError(t('error_no_input'));
    }
  } catch {
    showError(t('error_no_input'));
  }
}

/**
 * 打开设置页
 * @returns {void}
 */
function handleOpenSettings() {
  showSettings();
}

/**
 * 从设置页返回
 * @returns {void}
 */
function handleSettingsBack() {
  const mailbox = getActiveMailbox();
  if (mailbox) {
    showMain(mailbox);
    const messages = currentMessages.get(mailbox.id);
    if (messages) {
      renderMessages(mailbox.id, messages);
    }
  } else {
    showEmpty();
  }
}

/**
 * 保存主题偏好
 * @param {'auto'|'light'|'dark'} theme
 * @returns {Promise<void>}
 */
async function handleThemeChange(theme) {
  await setTheme(theme);
  applyTheme(theme);
}

/* ── 初始化 ─────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  $('btn-generate').addEventListener('click', handleGenerate);
  $('btn-new-mailbox').addEventListener('click', handleNewMailbox);
  $('btn-confirm-new').addEventListener('click', handleConfirmNew);
  $('btn-cancel-new').addEventListener('click', handleCancelNew);
  $('btn-copy').addEventListener('click', handleCopy);
  $('btn-refresh').addEventListener('click', handleRefresh);
  $('btn-discard').addEventListener('click', handleDiscard);
  $('btn-autofill').addEventListener('click', handleAutoFill);
  $('btn-back').addEventListener('click', handleBack);
  $('btn-settings').addEventListener('click', handleOpenSettings);
  $('btn-settings-back').addEventListener('click', handleSettingsBack);

  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.addEventListener('click', () => {
      void handleThemeChange(button.dataset.value);
    });
  });

  document.querySelectorAll('.language-btn').forEach((button) => {
    button.addEventListener('click', () => {
      void saveLanguagePreference(button.dataset.value);
    });
  });

  applyTheme(await getTheme());

  currentLangPreference = await getLanguage();
  applyI18n();

  mailboxes = await getAllMailboxes();
  activeMailboxId = await getActiveMailboxId();

  await migrateFromV1();

  if (!mailboxes.length) {
    mailboxes = await getAllMailboxes();
    activeMailboxId = await getActiveMailboxId();
  }

  await loadProviderSessions();

  mailboxes.forEach((mailbox) => {
    if (!knownMailIds.has(mailbox.id)) knownMailIds.set(mailbox.id, new Set());
    if (!currentMessages.has(mailbox.id)) currentMessages.set(mailbox.id, []);
  });

  if (mailboxes.length === 0) {
    showEmpty();
    return;
  }

  if (!mailboxes.find((mailbox) => mailbox.id === activeMailboxId)) {
    activeMailboxId = mailboxes[0].id;
    await setActiveMailboxId(activeMailboxId);
  }

  const activeMailbox = getActiveMailbox();
  showMain(activeMailbox);
  setMailStatus(t('loading'));
  await loadMessages(activeMailbox);

  mailboxes.forEach((mailbox) => startPolling(mailbox.id));
});

window.addEventListener('pagehide', stopAllPolling);
