/**
 * sanitize.js
 * 对所有将渲染到 DOM 的外部内容（邮件 HTML、纯文本）进行安全消毒
 * 依赖 DOMPurify 库，防止 XSS 攻击
 */
import DOMPurify from 'dompurify';

/**
 * DOMPurify 白名单配置
 * 只允许常见邮件排版标签，禁止所有脚本、样式及危险嵌入元素
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'div', 'span', 'a', 'img',
    'table', 'tr', 'td', 'th', 'thead', 'tbody',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u',
    'blockquote', 'pre', 'code', 'hr'
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'style'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur']
};

/**
 * 对邮件 HTML 正文进行消毒，移除所有危险标签和属性
 * @param {string|null|undefined} html - 原始 HTML 字符串
 * @returns {string} 消毒后的安全 HTML 字符串；输入为空时返回 ""
 */
export function sanitizeHTML(html) {
  // null / undefined / 空字符串 直接返回空字符串
  if (html == null || html === '') return '';
  return DOMPurify.sanitize(String(html), PURIFY_CONFIG);
}

/**
 * 将纯文本中的 HTML 特殊字符转义，防止意外解析为 HTML
 * @param {string|null} text - 原始文本字符串
 * @returns {string} 转义后的安全字符串；输入为空时返回 ""
 */
export function sanitizeText(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
