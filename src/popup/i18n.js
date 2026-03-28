/**
 * popup/i18n.js
 * 提供弹窗界面的语言解析与 DOM 翻译辅助函数。
 */

/**
 * 根据用户偏好与浏览器语言解析最终展示语言
 * @param {'auto'|'zh'|'en'|string} preference
 * @param {string} navigatorLanguage
 * @returns {'zh'|'en'}
 */
export function resolveDisplayLanguage(preference, navigatorLanguage = 'zh') {
  if (preference === 'zh' || preference === 'en') {
    return preference;
  }

  return String(navigatorLanguage || 'zh').toLowerCase().startsWith('en')
    ? 'en'
    : 'zh';
}

/**
 * 创建翻译函数
 * @param {Record<string, Record<string, string>>} translations
 * @param {'zh'|'en'} language
 * @returns {(key:string) => string}
 */
export function createTranslator(translations, language) {
  return function translate(key) {
    const pack = translations?.[language] || {};
    const fallback = translations?.en || {};
    if (key in pack) return pack[key];
    if (key in fallback) return fallback[key];
    return key;
  };
}

/**
 * 将翻译应用到页面的 data-i18n / title / placeholder 标记元素
 * @param {Document|HTMLElement} root
 * @param {(key:string) => string} translate
 * @returns {void}
 */
export function applyTranslations(root, translate) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = translate(element.getAttribute('data-i18n'));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.title = translate(element.getAttribute('data-i18n-title'));
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = translate(element.getAttribute('data-i18n-placeholder'));
  });
}
