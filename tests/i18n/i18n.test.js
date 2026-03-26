/**
 * i18n 单元测试
 * 验证多语言翻译查找、语言切换及回退机制的正确性
 */
import { t, setLanguage, getLanguage } from '../../src/i18n/index';

// 每次测试前重置为默认中文，避免测试间互相影响
beforeEach(() => {
  setLanguage('zh');
});

// ─── t（翻译查找函数）────────────────────────────────
describe('t（翻译查找）', () => {
  test('中文模式下 generate 应返回「生成临时邮箱」', () => {
    setLanguage('zh');

    expect(t('generate')).toBe('生成临时邮箱');
  });

  test('英文模式下 generate 应返回英文文本', () => {
    setLanguage('en');

    expect(t('generate')).toBe('Generate Temporary Email');
  });

  test('中文模式下 copy 应返回「复制」', () => {
    setLanguage('zh');

    expect(t('copy')).toBe('复制');
  });

  test('英文模式下 copy 应返回 Copy', () => {
    setLanguage('en');

    expect(t('copy')).toBe('Copy');
  });

  test('中文模式下 no_mail 应返回「暂无邮件，等待收件中...」', () => {
    setLanguage('zh');

    expect(t('no_mail')).toBe('暂无邮件，等待收件中...');
  });

  test('中文模式下 error_network 应返回对应中文提示', () => {
    setLanguage('zh');

    expect(t('error_network')).toBe('网络异常，请检查连接');
  });

  test('key 在所有语言包中均不存在时应原样返回 key 字符串', () => {
    expect(t('this_key_does_not_exist_xyz')).toBe('this_key_does_not_exist_xyz');
  });

  test('当前语言包缺少某个 key 时应回退到英文，不应返回 key 本身', () => {
    setLanguage('zh');
    // copied 在中英文语言包中均存在，结果不应等于 key
    const result = t('copied');
    expect(result).not.toBe('copied');
  });
});

// ─── setLanguage / getLanguage（语言切换）────────────
describe('setLanguage / getLanguage（语言切换）', () => {
  test('setLanguage("zh") 后 getLanguage 应返回 "zh"', () => {
    setLanguage('zh');

    expect(getLanguage()).toBe('zh');
  });

  test('setLanguage("en") 后 getLanguage 应返回 "en"', () => {
    setLanguage('en');

    expect(getLanguage()).toBe('en');
  });

  test('传入不支持的语言代码时应自动回退到 "en"', () => {
    setLanguage('jp');

    expect(getLanguage()).toBe('en');
  });

  test('传入空字符串时应自动回退到 "en"', () => {
    setLanguage('');

    expect(getLanguage()).toBe('en');
  });

  test('模块首次加载时默认语言应为 "zh"', () => {
    // isolateModules 创建一个全新的模块实例来测试初始状态
    jest.isolateModules(() => {
      const { getLanguage: getLang } = require('../../src/i18n/index');
      expect(getLang()).toBe('zh');
    });
  });
});
