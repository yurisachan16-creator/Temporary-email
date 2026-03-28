/**
 * popup/i18n 单元测试
 * 验证弹窗语言解析与 DOM 翻译工具的行为。
 */
import {
  resolveDisplayLanguage,
  createTranslator,
  applyTranslations,
} from '../../src/popup/i18n';

const translations = {
  zh: {
    language_label: '语言',
    generate: '生成临时邮箱',
    label_placeholder: '备注标签',
  },
  en: {
    language_label: 'Language',
    generate: 'Generate Temporary Email',
    label_placeholder: 'Label',
  },
};

describe('resolveDisplayLanguage（解析最终展示语言）', () => {
  test('显式选择中文时优先返回 zh', () => {
    expect(resolveDisplayLanguage('zh', 'en-US')).toBe('zh');
  });

  test('显式选择英文时优先返回 en', () => {
    expect(resolveDisplayLanguage('en', 'zh-CN')).toBe('en');
  });

  test('auto 模式下英文浏览器返回 en', () => {
    expect(resolveDisplayLanguage('auto', 'en-US')).toBe('en');
  });

  test('auto 模式下非英文浏览器默认返回 zh', () => {
    expect(resolveDisplayLanguage('auto', 'ja-JP')).toBe('zh');
  });
});

describe('applyTranslations（应用 DOM 翻译）', () => {
  test('会更新 data-i18n、title 与 placeholder', () => {
    document.body.innerHTML = `
      <button id="btn" data-i18n="generate"></button>
      <span id="title" data-i18n-title="language_label"></span>
      <input id="input" data-i18n-placeholder="label_placeholder" />
    `;

    const translate = createTranslator(translations, 'en');
    applyTranslations(document, translate);

    expect(document.getElementById('btn').textContent).toBe('Generate Temporary Email');
    expect(document.getElementById('title').title).toBe('Language');
    expect(document.getElementById('input').placeholder).toBe('Label');
  });
});
