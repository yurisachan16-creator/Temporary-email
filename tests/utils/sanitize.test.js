/**
 * sanitize 单元测试
 * 验证所有渲染到 DOM 的邮件内容均已通过安全消毒，防止 XSS 攻击
 */
import { sanitizeHTML, sanitizeText } from '../../src/utils/sanitize';

// ─── sanitizeHTML（邮件 HTML 正文消毒）───────────────
describe('sanitizeHTML（HTML 内容消毒）', () => {
  // ── 保留安全标签 ──
  test('应保留 <p> 标签及其文本内容', () => {
    const result = sanitizeHTML('<p>正常邮件内容</p>');

    expect(result).toContain('正常邮件内容');
  });

  test('应保留 <strong>、<em> 等安全格式标签', () => {
    const result = sanitizeHTML('<p>Hello <strong>World</strong> <em>!</em></p>');

    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
  });

  test('应保留 https:// 协议的超链接', () => {
    const result = sanitizeHTML('<a href="https://example.com">安全链接</a>');

    expect(result).toContain('https://example.com');
  });

  // ── 移除危险内容 ──
  test('应完整移除 <script> 标签及其内部代码', () => {
    const result = sanitizeHTML('<p>正常内容</p><script>alert("xss")</script>');

    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  test('应移除 <style> 标签', () => {
    const result = sanitizeHTML('<style>body { display:none }</style><p>内容</p>');

    expect(result).not.toContain('<style>');
  });

  test('应移除 onclick 等内联事件处理器', () => {
    const result = sanitizeHTML('<button onclick="alert(1)">点击</button>');

    expect(result).not.toContain('onclick');
  });

  test('应移除 onerror 等内联事件处理器', () => {
    const result = sanitizeHTML('<img src="x" onerror="alert(1)" />');

    expect(result).not.toContain('onerror');
  });

  test('应移除 href 中的 javascript: 伪协议', () => {
    const result = sanitizeHTML('<a href="javascript:alert(1)">恶意链接</a>');

    expect(result).not.toContain('javascript:');
  });

  test('应移除 <iframe> 标签', () => {
    const result = sanitizeHTML('<iframe src="https://evil.com"></iframe>');

    expect(result).not.toContain('iframe');
  });

  test('应移除 <object> 标签', () => {
    const result = sanitizeHTML('<object data="evil.swf"></object>');

    expect(result).not.toContain('object');
  });

  test('应移除 <embed> 标签', () => {
    const result = sanitizeHTML('<embed src="evil.swf" />');

    expect(result).not.toContain('embed');
  });

  // ── 边界输入 ──
  test('传入空字符串时应返回空字符串', () => {
    expect(sanitizeHTML('')).toBe('');
  });

  test('传入 null 时应返回空字符串，不抛出错误', () => {
    expect(sanitizeHTML(null)).toBe('');
  });

  test('传入 undefined 时应返回空字符串，不抛出错误', () => {
    expect(sanitizeHTML(undefined)).toBe('');
  });

  test('传入不含任何 HTML 标签的纯文本时，文字内容应原样保留', () => {
    const result = sanitizeHTML('这是一封纯文本邮件，无任何 HTML 标签。');

    expect(result).toContain('这是一封纯文本邮件');
  });
});

// ─── sanitizeText（纯文本 HTML 字符转义）─────────────
describe('sanitizeText（文本转义）', () => {
  test('应将 < 转义为 &lt;，防止被解析为 HTML 标签', () => {
    const result = sanitizeText('<script>');

    expect(result).toContain('&lt;');
    expect(result).not.toContain('<script>');
  });

  test('应将 > 转义为 &gt;', () => {
    const result = sanitizeText('<div>');

    expect(result).toContain('&gt;');
  });

  test('应将 & 转义为 &amp;', () => {
    const result = sanitizeText('AT&T');

    expect(result).toContain('&amp;');
  });

  test('普通中英文文本不含特殊字符时应原样返回', () => {
    expect(sanitizeText('Hello 世界')).toBe('Hello 世界');
  });

  test('传入 null 时应返回空字符串，不抛出错误', () => {
    expect(sanitizeText(null)).toBe('');
  });
});
