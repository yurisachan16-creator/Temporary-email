/**
 * content 单元测试
 * 验证页面邮箱输入框的识别规则与自动填写行为
 */
import { findEmailInput, fillEmail } from '../../src/content/content';

// 每次测试前清空 DOM，保证测试之间互相隔离
beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── findEmailInput（识别邮箱输入框）─────────────────
describe('findEmailInput（查找邮箱输入框）', () => {
  // ── 能识别的选择器类型 ──
  test('应识别 input[type="email"]', () => {
    document.body.innerHTML = '<form><input type="email" id="target" /></form>';

    const input = findEmailInput(document);

    expect(input).not.toBeNull();
    expect(input.type).toBe('email');
  });

  test('应识别 name 精确等于 "email" 的输入框', () => {
    document.body.innerHTML = '<input type="text" name="email" />';

    const input = findEmailInput(document);

    expect(input).not.toBeNull();
    expect(input.name).toBe('email');
  });

  test('应识别 name 中包含 "email" 字样的输入框（如 user_email）', () => {
    document.body.innerHTML = '<input type="text" name="user_email" />';

    const input = findEmailInput(document);

    expect(input).not.toBeNull();
  });

  test('应识别 placeholder 中含有 "email" 字样的输入框', () => {
    document.body.innerHTML = '<input type="text" placeholder="请输入邮箱地址 email" />';

    const input = findEmailInput(document);

    expect(input).not.toBeNull();
  });

  test('应识别 placeholder 中含有「邮箱」两字的输入框', () => {
    document.body.innerHTML = '<input type="text" placeholder="请输入邮箱" />';

    const input = findEmailInput(document);

    expect(input).not.toBeNull();
  });

  // ── 不应误匹配的情况 ──
  test('普通 username 输入框不应被识别为邮箱输入框', () => {
    document.body.innerHTML = '<input type="text" name="username" placeholder="用户名" />';

    const input = findEmailInput(document);

    expect(input).toBeNull();
  });

  test('页面无任何输入框时应返回 null', () => {
    document.body.innerHTML = '<div>没有任何输入框</div>';

    const input = findEmailInput(document);

    expect(input).toBeNull();
  });

  // ── 多个匹配时的优先级 ──
  test('多个匹配的输入框时应返回文档中出现的第一个', () => {
    document.body.innerHTML = `
      <input type="email" id="first" />
      <input type="email" id="second" />
    `;

    const input = findEmailInput(document);

    expect(input.id).toBe('first');
  });

  // ── 边界输入 ──
  test('传入 null 时应返回 null，不抛出错误', () => {
    const input = findEmailInput(null);

    expect(input).toBeNull();
  });
});

// ─── fillEmail（填写邮箱到输入框）────────────────────
describe('fillEmail（填入邮箱地址）', () => {
  // ── 正常填写 ──
  test('应将邮箱地址写入 input.value', () => {
    const input = document.createElement('input');
    input.type = 'email';

    fillEmail(input, 'test@1secmail.com');

    expect(input.value).toBe('test@1secmail.com');
  });

  test('成功填入时应返回 true', () => {
    const input = document.createElement('input');

    const result = fillEmail(input, 'test@1secmail.com');

    expect(result).toBe(true);
  });

  // ── 参数异常 ──
  test('input 为 null 时应返回 false，不抛出错误', () => {
    const result = fillEmail(null, 'test@1secmail.com');

    expect(result).toBe(false);
  });

  test('邮箱地址为空字符串时应返回 false', () => {
    const input = document.createElement('input');

    const result = fillEmail(input, '');

    expect(result).toBe(false);
  });

  test('邮箱地址为 null 时应返回 false', () => {
    const input = document.createElement('input');

    const result = fillEmail(input, null);

    expect(result).toBe(false);
  });

  // ── 事件触发（确保 React/Vue 等框架能感知到值的变化）──
  test('填入后应触发 input 事件', () => {
    const input = document.createElement('input');
    const mockHandler = jest.fn();
    input.addEventListener('input', mockHandler);

    fillEmail(input, 'test@1secmail.com');

    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('填入后应触发 change 事件', () => {
    const input = document.createElement('input');
    const mockHandler = jest.fn();
    input.addEventListener('change', mockHandler);

    fillEmail(input, 'test@1secmail.com');

    expect(mockHandler).toHaveBeenCalledTimes(1);
  });
});
