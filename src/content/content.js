/**
 * content.js
 * 内容脚本：在用户当前浏览的页面中识别邮箱输入框并自动填写
 *
 * 识别优先级（从高到低）：
 *   1. input[type="email"]
 *   2. input[name="email"]
 *   3. input[name*="email"]（name 包含 email）
 *   4. input[id*="email"]（id 包含 email）
 *   5. input[placeholder*="email"]（占位符含 email）
 *   6. input[placeholder*="邮箱"]（占位符含中文「邮箱」）
 */

// 识别邮箱输入框的 CSS 选择器列表（按优先级排列）
const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name*="email"]',
  'input[id*="email"]',
  'input[placeholder*="email"]',
  'input[placeholder*="邮箱"]'
];

/**
 * 在指定文档中查找第一个匹配的邮箱输入框
 * @param {Document|null} doc - 要搜索的文档对象
 * @returns {HTMLInputElement|null} 匹配的输入框元素，未找到或 doc 为 null 时返回 null
 */
export function findEmailInput(doc) {
  if (!doc) return null;
  // 按优先级逐一尝试选择器，返回第一个匹配项
  for (const selector of EMAIL_SELECTORS) {
    const input = doc.querySelector(selector);
    if (input) return input;
  }
  return null;
}

/**
 * 将邮箱地址填入指定输入框，并触发 input 和 change 事件
 * 触发事件是为了让 React、Vue 等框架感知到值的变化
 * @param {HTMLInputElement|null} input - 目标输入框元素
 * @param {string|null} email           - 要填入的邮箱地址
 * @returns {boolean} 成功填入返回 true，参数无效时返回 false
 */
export function fillEmail(input, email) {
  // 参数无效时提前返回 false，不抛出错误
  if (!input || !email) return false;

  input.value = email;

  // 分别触发 input 和 change 事件，确保框架双向绑定感知到新值
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}
