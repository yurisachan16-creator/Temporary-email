/**
 * storage.js
 * 封装 browser.storage.local 的读写操作
 * 使用统一的键名常量，与测试用例保持一致
 */

// ── 存储键名常量 ──────────────────────────────────────
const KEY_CURRENT_EMAIL  = 'currentEmail';    // 当前单邮箱地址（v1.x 兼容）
const KEY_EMAIL_LIST     = 'emailList';       // 多邮箱字符串数组（v1.x 兼容）
const KEY_MAILBOXES      = 'mailboxes';       // 多邮箱对象数组（v2.0）
const KEY_ACTIVE_MAILBOX = 'activeMailboxId'; // 当前激活邮箱 ID（v2.0）
const KEY_THEME          = 'theme';           // 主题偏好（v2.0）
const KEY_LANGUAGE       = 'language';        // 语言偏好（v2.0）
const KEY_PROVIDER_STORE = 'providerSession'; // 提供商会话映射（v2.0）

// PRD 限制：最多同时保存 5 个邮箱
const MAX_EMAIL_COUNT = 5;

// 有效主题值
const VALID_THEMES = ['auto', 'light', 'dark'];

// 有效语言值
const VALID_LANGUAGES = ['auto', 'zh', 'en'];

/**
 * 验证邮箱格式是否合法
 * @param {any} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

/**
 * 生成简单唯一 ID（不依赖外部库）
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── v1.x 兼容函数（保持原有行为不变）────────────────

/**
 * 保存当前使用的邮箱地址
 * @param {string} email - 合法的邮箱地址
 * @returns {Promise<void>}
 */
export async function saveEmail(email) {
  if (!isValidEmail(email)) {
    throw new Error('邮箱格式无效');
  }
  await browser.storage.local.set({ [KEY_CURRENT_EMAIL]: email });
}

/**
 * 读取当前使用的邮箱地址
 * @returns {Promise<string|null>} 邮箱地址，或 null（未保存时）
 */
export async function getEmail() {
  const result = await browser.storage.local.get(KEY_CURRENT_EMAIL);
  return result[KEY_CURRENT_EMAIL] ?? null;
}

/**
 * 清除当前使用的邮箱地址
 * @returns {Promise<void>}
 */
export async function clearEmail() {
  await browser.storage.local.remove(KEY_CURRENT_EMAIL);
}

/**
 * 获取多邮箱模式下的完整邮箱列表（v1.x 格式，仅地址字符串）
 * @returns {Promise<string[]>} 邮箱字符串数组，无记录时返回空数组
 */
export async function getAllEmails() {
  const result = await browser.storage.local.get(KEY_EMAIL_LIST);
  return result[KEY_EMAIL_LIST] ?? [];
}

/**
 * 保存完整的邮箱列表（v1.x 格式，覆盖旧数据）
 * @param {string[]} emails - 邮箱数组，最多 5 个
 * @returns {Promise<void>}
 */
export async function saveAllEmails(emails) {
  if (emails.length > MAX_EMAIL_COUNT) {
    throw new Error(`最多保存 ${MAX_EMAIL_COUNT} 个邮箱`);
  }
  await browser.storage.local.set({ [KEY_EMAIL_LIST]: emails });
}

// ── v2.0 多邮箱管理函数 ──────────────────────────────

/**
 * 获取所有邮箱对象（v2.0 格式）
 * @returns {Promise<Array<{id:string,address:string,label:string,createdAt:number,provider:string}>>}
 */
export async function getAllMailboxes() {
  const result = await browser.storage.local.get(KEY_MAILBOXES);
  return result[KEY_MAILBOXES] ?? [];
}

/**
 * 新增一个邮箱对象（v2.0）
 * 自动生成 id 和 createdAt，label 超过 20 字符时自动截断
 * @param {{ address: string, label?: string, provider?: string }} options
 * @returns {Promise<{id:string,address:string,label:string,createdAt:number,provider:string}>}
 */
export async function addMailbox({ address, label = '', provider = '1secmail' }) {
  if (!isValidEmail(address)) {
    throw new Error('邮箱格式无效');
  }
  const mailboxes = await getAllMailboxes();
  if (mailboxes.length >= MAX_EMAIL_COUNT) {
    throw new Error(`最多保存 ${MAX_EMAIL_COUNT} 个邮箱`);
  }
  const mailbox = {
    id:        generateId(),
    address,
    label:     String(label).slice(0, 20),
    createdAt: Date.now(),
    provider,
  };
  await browser.storage.local.set({ [KEY_MAILBOXES]: [...mailboxes, mailbox] });
  return mailbox;
}

/**
 * 删除指定 ID 的邮箱（v2.0）
 * 若删除的是当前激活邮箱，自动将激活 ID 切换到剩余第一个（或 null）
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removeMailbox(id) {
  const mailboxes = await getAllMailboxes();
  const filtered  = mailboxes.filter(m => m.id !== id);
  await browser.storage.local.set({ [KEY_MAILBOXES]: filtered });

  // 若删除的是当前激活邮箱，自动切换到第一个剩余邮箱（或清空）
  const activeId = await getActiveMailboxId();
  if (activeId === id) {
    const nextId = filtered.length > 0 ? filtered[0].id : null;
    await browser.storage.local.set({ [KEY_ACTIVE_MAILBOX]: nextId });
  }
}

/**
 * 读取当前激活的邮箱 ID（v2.0）
 * @returns {Promise<string|null>}
 */
export async function getActiveMailboxId() {
  const result = await browser.storage.local.get(KEY_ACTIVE_MAILBOX);
  return result[KEY_ACTIVE_MAILBOX] ?? null;
}

/**
 * 设置当前激活的邮箱 ID（v2.0）
 * @param {string|null} id
 * @returns {Promise<void>}
 */
export async function setActiveMailboxId(id) {
  await browser.storage.local.set({ [KEY_ACTIVE_MAILBOX]: id });
}

// ── v2.0 主题函数 ────────────────────────────────────

/**
 * 读取主题偏好设置（v2.0）
 * @returns {Promise<string>} 'auto' | 'light' | 'dark'，默认 'auto'
 */
export async function getTheme() {
  const result = await browser.storage.local.get(KEY_THEME);
  return result[KEY_THEME] ?? 'auto';
}

/**
 * 保存主题偏好设置（v2.0）
 * @param {'auto'|'light'|'dark'} theme
 * @returns {Promise<void>}
 */
export async function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) {
    throw new Error(`无效的主题值：${theme}，支持 ${VALID_THEMES.join(' / ')}`);
  }
  await browser.storage.local.set({ [KEY_THEME]: theme });
}

// ── v2.0 语言函数 ────────────────────────────────────

/**
 * 读取语言偏好设置（v2.0）
 * @returns {Promise<string>} 'auto' | 'zh' | 'en'，默认 'auto'
 */
export async function getLanguage() {
  const result = await browser.storage.local.get(KEY_LANGUAGE);
  return result[KEY_LANGUAGE] ?? 'auto';
}

/**
 * 保存语言偏好设置（v2.0）
 * @param {'auto'|'zh'|'en'} language
 * @returns {Promise<void>}
 */
export async function setLanguage(language) {
  if (!VALID_LANGUAGES.includes(language)) {
    throw new Error(`无效的语言值：${language}，支持 ${VALID_LANGUAGES.join(' / ')}`);
  }
  await browser.storage.local.set({ [KEY_LANGUAGE]: language });
}

// ── v2.0 提供商会话函数 ──────────────────────────────

/**
 * 读取所有提供商会话映射
 * @returns {Promise<Record<string, object>>}
 */
export async function getAllProviderSessions() {
  const result = await browser.storage.local.get(KEY_PROVIDER_STORE);
  return result[KEY_PROVIDER_STORE] ?? {};
}

/**
 * 读取指定邮箱的提供商会话
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function getProviderSession(email) {
  if (!email) return null;
  const sessions = await getAllProviderSessions();
  return sessions[email] ?? null;
}

/**
 * 保存指定邮箱的提供商会话
 * @param {string} email
 * @param {object} session
 * @returns {Promise<void>}
 */
export async function setProviderSession(email, session) {
  if (!isValidEmail(email)) {
    throw new Error('邮箱格式无效');
  }
  if (!session || typeof session !== 'object') {
    throw new Error('提供商会话无效');
  }

  const sessions = await getAllProviderSessions();
  await browser.storage.local.set({
    [KEY_PROVIDER_STORE]: {
      ...sessions,
      [email]: session,
    },
  });
}

/**
 * 清除指定邮箱的提供商会话；未传邮箱时清空全部会话
 * @param {string} [email]
 * @returns {Promise<void>}
 */
export async function clearProviderSession(email) {
  if (!email) {
    await browser.storage.local.remove(KEY_PROVIDER_STORE);
    return;
  }

  const sessions = await getAllProviderSessions();
  if (!(email in sessions)) return;

  delete sessions[email];
  await browser.storage.local.set({ [KEY_PROVIDER_STORE]: sessions });
}
