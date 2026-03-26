/**
 * i18n/index.js
 * 多语言翻译系统
 * 默认语言：中文（zh）
 * 支持语言：zh（中文）、en（英文）
 * 回退策略：当前语言缺少某个 key 时回退到英文；英文也缺少时返回 key 本身
 */
import zh from './zh.json';
import en from './en.json';

// 支持的语言列表
const SUPPORTED_LANGUAGES = ['zh', 'en'];

// 语言包映射
const translations = { zh, en };

// 当前语言，默认中文
let currentLanguage = 'zh';

/**
 * 切换当前语言
 * @param {string} lang - 语言代码（支持 "zh" 和 "en"）
 *                        不支持的代码自动回退到 "en"
 */
export function setLanguage(lang) {
  // 不在支持列表中则回退到英文
  currentLanguage = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
}

/**
 * 获取当前语言代码
 * @returns {string} "zh" 或 "en"
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * 查找指定 key 在当前语言下的翻译文本
 * @param {string} key - 语言包中的键名
 * @returns {string} 翻译文本；当前语言缺失时回退到英文；均缺失时返回 key 本身
 */
export function t(key) {
  const pack     = translations[currentLanguage] || {};
  const fallback = translations['en'] || {};
  // 优先当前语言，缺失时回退英文，均无则返回 key 本身
  if (key in pack)     return pack[key];
  if (key in fallback) return fallback[key];
  return key;
}
