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
  // TODO: 待实现
  throw new Error('未实现：saveEmail');
}

/**
 * 读取当前使用的邮箱地址
 * @returns {Promise<string|null>} 邮箱地址，或 null（未保存时）
 */
export async function getEmail() {
  // TODO: 待实现
  throw new Error('未实现：getEmail');
}

/**
 * 清除当前使用的邮箱地址
 * @returns {Promise<void>}
 */
export async function clearEmail() {
  // TODO: 待实现
  throw new Error('未实现：clearEmail');
}

/**
 * 获取多邮箱模式下的完整邮箱列表
 * @returns {Promise<string[]>} 邮箱字符串数组，无记录时返回空数组
 */
export async function getAllEmails() {
  // TODO: 待实现
  throw new Error('未实现：getAllEmails');
}

/**
 * 保存完整的邮箱列表（覆盖旧数据）
 * @param {string[]} emails - 邮箱数组，最多 5 个
 * @returns {Promise<void>}
 */
export async function saveAllEmails(emails) {
  // TODO: 待实现
  throw new Error('未实现：saveAllEmails');
}
