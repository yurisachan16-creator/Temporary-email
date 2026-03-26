/**
 * storage.js
 * 封装 browser.storage.local 的读写操作
 * 使用统一的键名常量，与测试用例保持一致
 */

// 存储键名常量
const KEY_CURRENT_EMAIL = 'currentEmail'; // 当前使用的单个邮箱地址
const KEY_EMAIL_LIST    = 'emailList';    // 多邮箱模式下的邮箱列表

// PRD 限制：最多同时保存 5 个邮箱
const MAX_EMAIL_COUNT = 5;

/**
 * 验证邮箱格式是否合法
 * @param {any} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

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
  // 键不存在时返回 null
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
 * 获取多邮箱模式下的完整邮箱列表
 * @returns {Promise<string[]>} 邮箱字符串数组，无记录时返回空数组
 */
export async function getAllEmails() {
  const result = await browser.storage.local.get(KEY_EMAIL_LIST);
  // 键不存在时返回空数组
  return result[KEY_EMAIL_LIST] ?? [];
}

/**
 * 保存完整的邮箱列表（覆盖旧数据）
 * @param {string[]} emails - 邮箱数组，最多 5 个
 * @returns {Promise<void>}
 */
export async function saveAllEmails(emails) {
  if (emails.length > MAX_EMAIL_COUNT) {
    throw new Error(`最多保存 ${MAX_EMAIL_COUNT} 个邮箱`);
  }
  await browser.storage.local.set({ [KEY_EMAIL_LIST]: emails });
}
