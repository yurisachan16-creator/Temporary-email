/**
 * mailService.js
 * 封装所有与 1secmail API 的交互，其他模块不直接调用 fetch
 *
 * API 文档：https://www.1secmail.com/api/v1/
 * 所有方法均返回 Promise，失败时抛出 Error
 */

// 1secmail API 基础地址
const BASE_URL = 'https://www.1secmail.com/api/v1/';

/**
 * 统一处理 HTTP 响应：非 ok 状态时抛出带状态码的错误
 * @param {Response} response - fetch 返回的 Response 对象
 * @returns {Promise<any>} 解析后的 JSON 数据
 */
async function handleResponse(response) {
  if (!response.ok) {
    throw new Error(`请求失败，状态码：${response.status}`);
  }
  return response.json();
}

/**
 * 生成一个随机临时邮箱地址
 * @returns {Promise<string>} 邮箱地址，例如 "abc123@1secmail.com"
 */
export async function generateEmail() {
  // TODO: 待实现
  throw new Error('未实现：generateEmail');
}

/**
 * 获取指定邮箱的收件列表
 * @param {string} login  - 邮箱用户名（@ 前的部分）
 * @param {string} domain - 邮箱域名（@ 后的部分）
 * @returns {Promise<Array>} 邮件摘要对象数组（含 id、from、subject、date）
 */
export async function getMessages(login, domain) {
  // TODO: 待实现
  throw new Error('未实现：getMessages');
}

/**
 * 读取指定邮件的完整内容
 * @param {string} login  - 邮箱用户名
 * @param {string} domain - 邮箱域名
 * @param {number} id     - 邮件 ID
 * @returns {Promise<Object>} 邮件详情对象（含 id、from、subject、body、textBody、date）
 */
export async function readMessage(login, domain, id) {
  // TODO: 待实现
  throw new Error('未实现：readMessage');
}

/**
 * 删除指定邮件
 * @param {string} login  - 邮箱用户名
 * @param {string} domain - 邮箱域名
 * @param {number} id     - 邮件 ID
 * @returns {Promise<boolean>} 删除成功返回 true
 */
export async function deleteMessage(login, domain, id) {
  // TODO: 待实现
  throw new Error('未实现：deleteMessage');
}

/**
 * 获取当前所有可用的邮箱域名
 * @returns {Promise<string[]>} 域名字符串数组，例如 ["1secmail.com", "1secmail.net"]
 */
export async function getDomainList() {
  // TODO: 待实现
  throw new Error('未实现：getDomainList');
}
