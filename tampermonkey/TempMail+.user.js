// ==UserScript==
// @name         TempMail+
// @namespace    https://github.com/yurisachan16-creator/Temporary-email
// @version      1.0.0
// @description  一键生成临时邮箱，自动填入表单，查收邮件，用完即弃。支持中文/英文。
// @author       yurisachan16-creator
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      www.1secmail.com
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js
// ==/UserScript==

/**
 * TempMail+ Tampermonkey 版
 *
 * 架构说明：
 *   - 使用 Shadow DOM 隔离面板样式，避免与目标页面 CSS 冲突
 *   - 使用 GM_xmlhttpRequest 绕过跨域限制，直接请求 1secmail API
 *   - 使用 GM_getValue / GM_setValue 持久化存储邮箱地址
 *   - 自动填入直接操作页面 DOM（无需 content-script）
 *   - DOMPurify 由 @require 加载，消毒邮件 HTML 正文
 */

'use strict';

/* ──────────────────────────────────────────────────────
   防止 SPA 路由时重复注入
────────────────────────────────────────────────────── */
if (document.getElementById('tempmail-plus-root')) {
  // 已注入，跳过本次执行
} else {

/* ──────────────────────────────────────────────────────
   常量与运行时状态
────────────────────────────────────────────────────── */
const API_BASE      = 'https://www.1secmail.com/api/v1/';
const STORAGE_KEY   = 'tm_currentEmail';
const POLL_INTERVAL = 10_000;  // 轮询间隔（毫秒）

let currentEmail = null;   // 当前邮箱地址
let pollTimer    = null;   // setInterval 句柄
let knownMailIds = new Set();  // 已知邮件 ID，用于检测新邮件
let isDragging   = false;      // 拖拽状态
let dragStartX   = 0, dragStartY  = 0;  // 拖拽起始鼠标坐标
let panelStartX  = 0, panelStartY = 0;  // 拖拽起始面板坐标

/* ──────────────────────────────────────────────────────
   国际化（内嵌翻译，无需外部文件）
────────────────────────────────────────────────────── */
const TRANSLATIONS = {
  zh: {
    title:             'TempMail+',
    generate:          '生成临时邮箱',
    copy:              '复制',
    copied:            '已复制 ✓',
    refresh:           '刷新',
    no_mail:           '暂无邮件，等待收件中...',
    auto_fill:         '自动填入',
    discard:           '🗑 丢弃',
    back:              '← 返回',
    loading:           '加载中...',
    mail_from:         '发件人',
    mail_date:         '时间',
    confirm_discard:   '确认丢弃此邮箱？丢弃后将无法恢复。',
    error_network:     '网络异常，请检查连接',
    error_no_input:    '页面上未找到邮箱输入框',
    inbox_title:       '收件箱',
    no_subject:        '（无主题）',
    new_mail:          '收到新邮件',
    auto_fill_success: '邮箱已成功填入 ✓',
    empty_desc:        '使用临时邮箱保护您的真实邮件地址\n注册完成后可直接丢弃',
    drag_hint:         '可拖动',
  },
  en: {
    title:             'TempMail+',
    generate:          'Generate Temporary Email',
    copy:              'Copy',
    copied:            'Copied ✓',
    refresh:           'Refresh',
    no_mail:           'No emails yet, waiting...',
    auto_fill:         'Auto Fill',
    discard:           '🗑 Discard',
    back:              '← Back',
    loading:           'Loading...',
    mail_from:         'From',
    mail_date:         'Date',
    confirm_discard:   'Discard this email? This cannot be undone.',
    error_network:     'Network error, please check connection',
    error_no_input:    'No email input field found on this page',
    inbox_title:       'Inbox',
    no_subject:        '(No Subject)',
    new_mail:          'New email received',
    auto_fill_success: 'Email filled successfully ✓',
    empty_desc:        'Use a temporary email to protect your real address.\nDiscard it when done.',
    drag_hint:         'Draggable',
  }
};

// 根据浏览器语言自动选择
const lang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';

/**
 * 翻译键值查询
 * @param {string} key
 * @returns {string}
 */
function t(key) {
  return (TRANSLATIONS[lang] || TRANSLATIONS.en)[key] || key;
}

/* ──────────────────────────────────────────────────────
   GM API 封装
────────────────────────────────────────────────────── */

/**
 * 将 GM_xmlhttpRequest 包装为 Promise，用于跨域 API 请求
 * @param {string} url
 * @returns {Promise<any>} 解析后的 JSON 数据
 */
function gmFetch(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method:  'GET',
      url,
      timeout: 15_000,
      headers: {
        // 使用真实浏览器 UA，避免被识别为脚本请求
        'User-Agent': navigator.userAgent,
        'Accept':     'application/json, text/plain, */*',
        // 只设置 Referer，不设置 Origin（Origin 仅用于 POST/PUT 跨域，GET 请求
        // 设置 Origin 会触发服务器 CORS 验证逻辑，可能导致 403）
        'Referer': 'https://www.1secmail.com/',
      },
      // 不携带当前页面（如 bilibili）的 Cookie
      anonymous: true,
      onload(res) {
        if (res.status >= 200 && res.status < 300) {
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('JSON 解析失败'));
          }
        } else {
          // 将响应体前 120 字符附加到错误信息，方便排查
          const hint = res.responseText
            ? `：${res.responseText.slice(0, 120)}`
            : '';
          reject(new Error(`${t('error_network')}（${res.status}${hint}）`));
        }
      },
      onerror()   { reject(new Error(`${t('error_network')}（连接失败）`)); },
      ontimeout() { reject(new Error(`${t('error_network')}（超时）`)); },
    });
  });
}

/* ──────────────────────────────────────────────────────
   API 调用（1secmail）
────────────────────────────────────────────────────── */

/** 生成随机临时邮箱，返回邮箱地址字符串 */
async function apiGenerateEmail() {
  const data = await gmFetch(`${API_BASE}?action=genRandomMailbox&count=1`);
  return data[0];
}

/** 获取收件列表 */
async function apiGetMessages(login, domain) {
  return gmFetch(`${API_BASE}?action=getMessages&login=${login}&domain=${domain}`);
}

/** 读取单封邮件完整内容 */
async function apiReadMessage(login, domain, id) {
  return gmFetch(`${API_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${id}`);
}

/* ──────────────────────────────────────────────────────
   本地存储（GM_getValue / GM_setValue）
────────────────────────────────────────────────────── */

/** 读取已保存的邮箱地址（同步） */
function readSavedEmail()    { return GM_getValue(STORAGE_KEY, null); }

/** 持久化保存邮箱地址 */
function persistEmail(email) { GM_setValue(STORAGE_KEY, email); }

/** 清除已保存的邮箱地址 */
function eraseEmail()        { GM_setValue(STORAGE_KEY, null); }

/* ──────────────────────────────────────────────────────
   Shadow DOM 注入：宿主元素 + 样式 + 面板 HTML
────────────────────────────────────────────────────── */

// 宿主元素（固定定位，宽高为 0，不影响页面布局）
const host = document.createElement('div');
host.id = 'tempmail-plus-root';
Object.assign(host.style, {
  position: 'fixed',
  zIndex:   '2147483647',
  bottom:   '0',
  right:    '0',
  width:    '0',
  height:   '0',
  overflow: 'visible',
});
document.body.appendChild(host);

// 创建 Shadow DOM（隔离样式）
const shadow = host.attachShadow({ mode: 'open' });

/* ── 样式表 ── */
const styleEl = document.createElement('style');
styleEl.textContent = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ── 悬浮切换按钮 ── */
  #tm-toggle {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #4F46E5;
    color: #fff;
    font-size: 22px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(79, 70, 229, 0.5);
    transition: transform 0.15s ease, background 0.15s ease;
    z-index: 2147483647;
    line-height: 1;
    font-family: sans-serif;
    user-select: none;
  }
  #tm-toggle:hover  { background: #4338CA; transform: scale(1.1); }
  #tm-toggle:active { transform: scale(0.95); }

  /* ── 主面板 ── */
  #tm-panel {
    position: fixed;
    right: 20px;
    bottom: 80px;
    width: min(380px, calc(100vw - 24px));
    max-height: 560px;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.20);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
                 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    color: #111827;
    overflow: hidden;
    z-index: 2147483646;
    line-height: 1.5;
  }
  #tm-panel.tm-hidden { display: none !important; }

  /* ── 标题栏（拖拽把手）── */
  #tm-drag-handle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: #4F46E5;
    color: #fff;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  #tm-drag-handle:active { cursor: grabbing; }
  .tm-header-icon  { font-size: 17px; }
  .tm-header-title { font-size: 14px; font-weight: 600; flex: 1; }
  #tm-close-btn {
    background: none;
    border: none;
    color: rgba(255,255,255,0.8);
    font-size: 20px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    transition: color 0.1s;
    font-family: sans-serif;
  }
  #tm-close-btn:hover { color: #fff; }

  /* ── 可滚动内容区 ── */
  .tm-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* ── 按钮 ── */
  .tm-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 14px;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s, background 0.15s;
    font-family: inherit;
    line-height: 1.4;
  }
  .tm-btn:hover  { opacity: 0.85; }
  .tm-btn:active { opacity: 0.70; }
  .tm-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .tm-btn-primary { background: #4F46E5; color: #fff; border-color: #4F46E5; }
  .tm-btn-primary:hover { background: #4338CA; opacity: 1; }

  .tm-btn-outline { background: transparent; color: #111827; border-color: #E5E7EB; }
  .tm-btn-outline:hover { background: #F9FAFB; opacity: 1; }

  .tm-btn-danger { background: transparent; color: #EF4444; border-color: #EF4444; font-size: 12px; }

  .tm-btn-lg { padding: 10px 28px; font-size: 15px; }
  .tm-btn-sm { padding: 4px 10px; font-size: 12px; }

  /* ── 空状态 ── */
  .tm-empty {
    padding: 32px 20px;
    text-align: center;
  }
  .tm-empty-icon { font-size: 48px; margin-bottom: 12px; }
  .tm-empty-desc {
    color: #6B7280;
    font-size: 13px;
    margin-bottom: 22px;
    line-height: 1.7;
    white-space: pre-line;
  }

  /* ── 邮箱地址栏 ── */
  .tm-email-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #F9FAFB;
    border-bottom: 1px solid #E5E7EB;
  }
  .tm-email-addr {
    flex: 1;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #4F46E5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── 操作按钮行 ── */
  .tm-actions {
    display: flex;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid #E5E7EB;
  }

  /* ── 收件箱标题行 ── */
  .tm-inbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid #E5E7EB;
  }
  .tm-inbox-title {
    font-size: 12px;
    font-weight: 600;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .tm-inbox-right { display: flex; align-items: center; gap: 6px; }

  /* ── 轮询绿色脉冲指示器 ── */
  .tm-poll {
    color: #10B981;
    font-size: 13px;
    animation: tm-pulse 1.8s ease-in-out infinite;
  }
  @keyframes tm-pulse {
    0%, 100% { opacity: 1;    }
    50%       { opacity: 0.2; }
  }

  /* ── 邮件列表 ── */
  .tm-mail-item {
    padding: 10px 14px;
    border-bottom: 1px solid #E5E7EB;
    cursor: pointer;
    transition: background 0.1s;
  }
  .tm-mail-item:hover { background: #F9FAFB; }
  .tm-mail-from {
    font-size: 11px; color: #6B7280; margin-bottom: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tm-mail-subject {
    font-size: 13px; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tm-mail-date { font-size: 11px; color: #6B7280; margin-top: 3px; }

  /* ── 状态文字 ── */
  .tm-state {
    padding: 24px 16px;
    text-align: center;
    font-size: 13px;
    color: #6B7280;
  }
  .tm-state.tm-error { color: #EF4444; }

  /* ── 邮件详情 ── */
  .tm-detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #F9FAFB;
    border-bottom: 1px solid #E5E7EB;
    flex-shrink: 0;
  }
  .tm-detail-subject {
    flex: 1; font-size: 13px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tm-detail-meta {
    padding: 8px 14px;
    background: #F9FAFB;
    border-bottom: 1px solid #E5E7EB;
  }
  .tm-detail-meta-row { font-size: 12px; color: #6B7280; line-height: 1.6; }
  .tm-detail-body {
    padding: 14px;
    font-size: 13px;
    line-height: 1.7;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .tm-detail-body img { max-width: 100%; height: auto; }
  /* 重置详情正文内可能被页面污染的样式 */
  .tm-detail-body * { max-width: 100%; }

  /* ── 错误横幅 ── */
  .tm-error-banner {
    padding: 7px 14px;
    background: #FEF2F2;
    border-top: 1px solid #FECACA;
    color: #EF4444;
    font-size: 12px;
    flex-shrink: 0;
  }
  .tm-error-banner.tm-hidden { display: none; }

  /* ── Toast 轻提示 ── */
  .tm-toast {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: #1F2937;
    color: #fff;
    padding: 5px 16px;
    border-radius: 20px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .tm-toast.tm-visible { opacity: 1; }
`;
shadow.appendChild(styleEl);

/* ── 悬浮切换按钮 ── */
const toggleBtn = document.createElement('button');
toggleBtn.id        = 'tm-toggle';
toggleBtn.title     = 'TempMail+';
toggleBtn.innerHTML = '✉';
shadow.appendChild(toggleBtn);

/* ── 主面板（由 JavaScript 动态生成，避免 XSS 字符串拼接） ── */
const panel = document.createElement('div');
panel.id = 'tm-panel';
panel.classList.add('tm-hidden');

// 标题栏
const dragHandle = document.createElement('div');
dragHandle.id = 'tm-drag-handle';
dragHandle.title = t('drag_hint');
dragHandle.innerHTML = `
  <span class="tm-header-icon">✉</span>
  <span class="tm-header-title">${t('title')}</span>
`;
const closeBtn = document.createElement('button');
closeBtn.id        = 'tm-close-btn';
closeBtn.title     = '关闭';
closeBtn.innerHTML = '×';
dragHandle.appendChild(closeBtn);
panel.appendChild(dragHandle);

// 可滚动内容区
const body = document.createElement('div');
body.className = 'tm-body';

// ① 空状态视图
const viewEmpty = document.createElement('div');
viewEmpty.id = 'tm-view-empty';
viewEmpty.innerHTML = `
  <div class="tm-empty">
    <div class="tm-empty-icon">📬</div>
    <p class="tm-empty-desc">${t('empty_desc')}</p>
    <button id="tm-btn-generate" class="tm-btn tm-btn-primary tm-btn-lg">
      ${t('generate')}
    </button>
  </div>
`;
body.appendChild(viewEmpty);

// ② 主视图
const viewMain = document.createElement('div');
viewMain.id = 'tm-view-main';
viewMain.style.display = 'none';
viewMain.innerHTML = `
  <div class="tm-email-bar">
    <span id="tm-email-addr" class="tm-email-addr"></span>
    <button id="tm-btn-copy" class="tm-btn tm-btn-outline tm-btn-sm">${t('copy')}</button>
  </div>
  <div class="tm-actions">
    <button id="tm-btn-autofill" class="tm-btn tm-btn-primary tm-btn-sm">${t('auto_fill')}</button>
    <button id="tm-btn-discard"  class="tm-btn tm-btn-danger">${t('discard')}</button>
  </div>
  <div class="tm-inbox-header">
    <span class="tm-inbox-title">${t('inbox_title')}</span>
    <div class="tm-inbox-right">
      <span id="tm-poll-dot" class="tm-poll" style="display:none" title="自动刷新中">●</span>
      <button id="tm-btn-refresh" class="tm-btn tm-btn-outline tm-btn-sm">${t('refresh')}</button>
    </div>
  </div>
  <div id="tm-mail-list"></div>
`;
body.appendChild(viewMain);

// ③ 详情视图
const viewDetail = document.createElement('div');
viewDetail.id = 'tm-view-detail';
viewDetail.style.display = 'none';
viewDetail.innerHTML = `
  <div class="tm-detail-header">
    <button id="tm-btn-back" class="tm-btn tm-btn-outline tm-btn-sm">${t('back')}</button>
    <span id="tm-detail-subject" class="tm-detail-subject"></span>
  </div>
  <div class="tm-detail-meta">
    <div id="tm-detail-from" class="tm-detail-meta-row"></div>
    <div id="tm-detail-date" class="tm-detail-meta-row"></div>
  </div>
  <div id="tm-detail-body" class="tm-detail-body"></div>
`;
body.appendChild(viewDetail);

panel.appendChild(body);

// 错误横幅
const errorBanner = document.createElement('div');
errorBanner.id        = 'tm-error-banner';
errorBanner.className = 'tm-error-banner tm-hidden';
panel.appendChild(errorBanner);

// Toast
const toast = document.createElement('div');
toast.id        = 'tm-toast';
toast.className = 'tm-toast';
panel.appendChild(toast);

shadow.appendChild(panel);

/* ──────────────────────────────────────────────────────
   Shadow DOM 内工具函数
────────────────────────────────────────────────────── */

/** 在 Shadow DOM 内通过 ID 查找元素 */
function $s(id) { return shadow.getElementById(id); }

/* ──────────────────────────────────────────────────────
   HTML 转义（用于列表中的纯文本展示）
────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ──────────────────────────────────────────────────────
   UI 视图切换
────────────────────────────────────────────────────── */

function showEmpty() {
  $s('tm-view-empty').style.display  = '';
  $s('tm-view-main').style.display   = 'none';
  $s('tm-view-detail').style.display = 'none';
  stopPolling();
}

function showMain(email) {
  $s('tm-view-empty').style.display  = 'none';
  $s('tm-view-main').style.display   = '';
  $s('tm-view-detail').style.display = 'none';
  const el = $s('tm-email-addr');
  el.textContent = email;
  el.title       = email;
}

function showDetail(msg) {
  $s('tm-view-empty').style.display  = 'none';
  $s('tm-view-main').style.display   = 'none';
  $s('tm-view-detail').style.display = '';

  $s('tm-detail-subject').textContent = msg.subject || t('no_subject');
  $s('tm-detail-from').textContent    = `${t('mail_from')}: ${msg.from || ''}`;
  $s('tm-detail-date').textContent    = `${t('mail_date')}: ${msg.date || ''}`;

  const bodyEl = $s('tm-detail-body');
  if (msg.htmlBody && msg.htmlBody.trim()) {
    // DOMPurify 由 @require 注入为全局变量，对邮件 HTML 进行 XSS 消毒
    bodyEl.innerHTML = (typeof DOMPurify !== 'undefined')
      ? DOMPurify.sanitize(msg.htmlBody, { USE_PROFILES: { html: true } })
      : escHtml(msg.textBody || '');
  } else {
    // 纯文本邮件
    bodyEl.textContent = msg.textBody || '';
  }
}

/* ──────────────────────────────────────────────────────
   邮件列表渲染
────────────────────────────────────────────────────── */

function setMailStatus(text, isError = false) {
  $s('tm-mail-list').innerHTML =
    `<div class="tm-state${isError ? ' tm-error' : ''}">${escHtml(text)}</div>`;
}

function renderMessages(messages) {
  if (!messages || messages.length === 0) {
    setMailStatus(t('no_mail'));
    return;
  }

  // 检测新邮件（首次加载不提示）
  const newIds = messages.map(m => m.id);
  const hasNew = knownMailIds.size > 0 && newIds.some(id => !knownMailIds.has(id));
  if (hasNew) showToast(t('new_mail'));
  knownMailIds = new Set(newIds);

  const listEl = $s('tm-mail-list');
  listEl.innerHTML = '';

  messages.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'tm-mail-item';
    item.dataset.id = msg.id;
    item.innerHTML = `
      <div class="tm-mail-from">${escHtml(msg.from)}</div>
      <div class="tm-mail-subject">${escHtml(msg.subject || t('no_subject'))}</div>
      <div class="tm-mail-date">${escHtml(msg.date)}</div>
    `;
    item.addEventListener('click', () => handleMailClick(Number(item.dataset.id)));
    listEl.appendChild(item);
  });
}

/* ──────────────────────────────────────────────────────
   Toast 与错误横幅
────────────────────────────────────────────────────── */

let toastTimer = null;

function showToast(msg) {
  const el = $s('tm-toast');
  el.textContent = msg;
  el.classList.add('tm-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('tm-visible'), 2000);
}

let errorTimer = null;

function showError(msg) {
  const el = $s('tm-error-banner');
  el.textContent = `⚠ ${msg}`;
  el.classList.remove('tm-hidden');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => el.classList.add('tm-hidden'), 3500);
}

/* ──────────────────────────────────────────────────────
   轮询
────────────────────────────────────────────────────── */

function startPolling(email) {
  stopPolling();
  $s('tm-poll-dot').style.display = '';
  pollTimer = setInterval(() => loadMessages(email), POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  const dot = $s('tm-poll-dot');
  if (dot) dot.style.display = 'none';
}

async function loadMessages(email) {
  const [login, domain] = email.split('@');
  try {
    const msgs = await apiGetMessages(login, domain);
    renderMessages(msgs);
  } catch (e) {
    setMailStatus(e.message, true);
  }
}

/* ──────────────────────────────────────────────────────
   事件处理器
────────────────────────────────────────────────────── */

async function handleGenerate() {
  const btn = $s('tm-btn-generate');
  btn.disabled    = true;
  btn.textContent = t('loading');
  try {
    const email = await apiGenerateEmail();
    persistEmail(email);
    currentEmail = email;
    knownMailIds = new Set();
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

async function handleCopy() {
  if (!currentEmail) return;
  try {
    await navigator.clipboard.writeText(currentEmail);
    const btn = $s('tm-btn-copy');
    const orig = btn.textContent;
    btn.textContent = t('copied');
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    showError(t('error_network'));
  }
}

async function handleRefresh() {
  if (!currentEmail) return;
  setMailStatus(t('loading'));
  await loadMessages(currentEmail);
}

async function handleDiscard() {
  if (!confirm(t('confirm_discard'))) return;
  stopPolling();
  eraseEmail();
  currentEmail = null;
  knownMailIds = new Set();
  showEmpty();
}

async function handleMailClick(msgId) {
  if (!currentEmail) return;
  const [login, domain] = currentEmail.split('@');
  try {
    const msg = await apiReadMessage(login, domain, msgId);
    showDetail(msg);
  } catch (e) {
    showError(e.message);
  }
}

function handleAutoFill() {
  if (!currentEmail) return;

  // 用户脚本直接运行在页面上下文，无需 content-script，直接操作 DOM
  const SELECTORS = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name*="email"]',
    'input[id*="email"]',
    'input[placeholder*="email"]',
    'input[placeholder*="邮箱"]',
  ];

  let input = null;
  for (const sel of SELECTORS) {
    input = document.querySelector(sel);
    if (input) break;
  }

  if (!input) {
    showError(t('error_no_input'));
    return;
  }

  input.value = currentEmail;
  // 同时触发两种事件，确保 React/Vue 等框架响应
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();
  showToast(t('auto_fill_success'));
}

/* ──────────────────────────────────────────────────────
   面板显隐 & 拖拽
────────────────────────────────────────────────────── */

function togglePanel() {
  panel.classList.toggle('tm-hidden');
}

// 拖拽：mousedown 在 shadow DOM 内监听，mousemove/mouseup 在 document 上监听
dragHandle.addEventListener('mousedown', (e) => {
  // 点击关闭按钮时不启动拖拽
  if (e.target === closeBtn) return;
  isDragging  = true;
  dragStartX  = e.clientX;
  dragStartY  = e.clientY;
  const rect  = panel.getBoundingClientRect();
  panelStartX = rect.left;
  panelStartY = rect.top;
  e.preventDefault();  // 防止文本选中
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const newLeft = panelStartX + (e.clientX - dragStartX);
  const newTop  = panelStartY + (e.clientY - dragStartY);
  // 限制面板不超出视口
  const maxLeft = window.innerWidth  - panel.offsetWidth;
  const maxTop  = window.innerHeight - panel.offsetHeight;
  panel.style.left   = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
  panel.style.top    = `${Math.max(0, Math.min(newTop,  maxTop))}px`;
  panel.style.right  = 'auto';
  panel.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => { isDragging = false; });

// 阻止面板内的点击事件冒泡到页面
panel.addEventListener('click', (e) => e.stopPropagation());

/* ──────────────────────────────────────────────────────
   绑定所有按钮事件
────────────────────────────────────────────────────── */

toggleBtn.addEventListener('click', togglePanel);
closeBtn.addEventListener('click', () => panel.classList.add('tm-hidden'));

$s('tm-btn-generate').addEventListener('click', handleGenerate);
$s('tm-btn-copy').addEventListener('click',     handleCopy);
$s('tm-btn-refresh').addEventListener('click',  handleRefresh);
$s('tm-btn-discard').addEventListener('click',  handleDiscard);
$s('tm-btn-autofill').addEventListener('click', handleAutoFill);
$s('tm-btn-back').addEventListener('click',     () => showMain(currentEmail));

/* ──────────────────────────────────────────────────────
   初始化：恢复上次保存的邮箱
────────────────────────────────────────────────────── */

(async function init() {
  currentEmail = readSavedEmail();
  if (currentEmail) {
    showMain(currentEmail);
    setMailStatus(t('loading'));
    await loadMessages(currentEmail);
    startPolling(currentEmail);
  } else {
    showEmpty();
  }
})();

} // end: 防重复注入检查
