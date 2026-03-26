/**
 * tests/tampermonkey/gmApi.test.js
 *
 * 测试 Tampermonkey 版本的核心 API 逻辑。
 *
 * 由于用户脚本（.user.js）不使用 ES Module 导出，
 * 此文件将被测函数以相同逻辑在此重新定义，
 * 通过 mock GM_xmlhttpRequest / GM_getValue / GM_setValue
 * 全局对象进行单元测试。
 *
 * 如修改了 TempMail+.user.js 中的 gmFetch / api* / storage* 函数，
 * 需同步更新此文件中对应的函数体。
 */

'use strict';

/* ── 模拟 Tampermonkey 全局 API ── */
global.GM_xmlhttpRequest = jest.fn();
global.GM_getValue       = jest.fn();
global.GM_setValue       = jest.fn();
global.navigator         = { userAgent: 'TestAgent/1.0' };

/* ── 常量（与 user.js 保持一致）── */
const API_BASE    = 'https://www.1secmail.com/api/v1/';
const STORAGE_KEY = 'tm_currentEmail';

/* ────────────────────────────────────────────────────────
   被测函数（从 TempMail+.user.js 中提取，逻辑保持一致）
   如主脚本更新，同步修改以下函数。
──────────────────────────────────────────────────────── */

function gmFetch(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method:  'GET',
      url,
      timeout: 15_000,
      headers: {
        'User-Agent': navigator.userAgent,
        'Accept':     'application/json, text/plain, */*',
        // 不设置 Referer / Origin（与主脚本保持一致）
      },
      anonymous: true,
      onload(res) {
        if (res.status >= 200 && res.status < 300) {
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('JSON 解析失败'));
          }
        } else {
          const hint = res.responseText
            ? `：${res.responseText.slice(0, 120)}`
            : '';
          reject(new Error(`网络异常（${res.status}${hint}）`));
        }
      },
      onerror()   { reject(new Error('网络异常（连接失败）')); },
      ontimeout() { reject(new Error('网络异常（超时）')); },
    });
  });
}

async function apiGenerateEmail() {
  const data = await gmFetch(`${API_BASE}?action=genRandomMailbox&count=1`);
  return data[0];
}

async function apiGetMessages(login, domain) {
  return gmFetch(`${API_BASE}?action=getMessages&login=${login}&domain=${domain}`);
}

async function apiReadMessage(login, domain, id) {
  return gmFetch(`${API_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${id}`);
}

function readSavedEmail()    { return GM_getValue(STORAGE_KEY, null); }
function persistEmail(email) { GM_setValue(STORAGE_KEY, email); }
function eraseEmail()        { GM_setValue(STORAGE_KEY, null); }

/* ────────────────────────────────────────────────────────
   辅助：模拟 GM_xmlhttpRequest 的响应
──────────────────────────────────────────────────────── */

/**
 * 让 GM_xmlhttpRequest 触发 onload 回调
 * @param {number} status      HTTP 状态码
 * @param {string} body        响应体（字符串）
 */
function mockOnload(status, body) {
  GM_xmlhttpRequest.mockImplementationOnce(({ onload }) => {
    onload({ status, responseText: body });
  });
}

/**
 * 让 GM_xmlhttpRequest 触发 onerror 回调
 */
function mockOnerror() {
  GM_xmlhttpRequest.mockImplementationOnce(({ onerror }) => {
    onerror();
  });
}

/**
 * 让 GM_xmlhttpRequest 触发 ontimeout 回调
 */
function mockOntimeout() {
  GM_xmlhttpRequest.mockImplementationOnce(({ ontimeout }) => {
    ontimeout();
  });
}

/* ────────────────────────────────────────────────────────
   测试：gmFetch
──────────────────────────────────────────────────────── */

describe('gmFetch', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
  });

  test('200 响应时正确解析 JSON 并 resolve', async () => {
    mockOnload(200, JSON.stringify(['abc@1secmail.com']));
    const result = await gmFetch(`${API_BASE}?action=genRandomMailbox&count=1`);
    expect(result).toEqual(['abc@1secmail.com']);
  });

  test('403 响应时 reject 并携带状态码', async () => {
    mockOnload(403, 'Forbidden');
    await expect(gmFetch('https://any.url')).rejects.toThrow('403');
  });

  test('403 响应时错误信息包含响应体前缀', async () => {
    mockOnload(403, 'Access denied by firewall');
    await expect(gmFetch('https://any.url'))
      .rejects.toThrow('Access denied by firewall');
  });

  test('500 响应时 reject 并携带状态码', async () => {
    mockOnload(500, 'Internal Server Error');
    await expect(gmFetch('https://any.url')).rejects.toThrow('500');
  });

  test('onerror 回调时 reject 并提示连接失败', async () => {
    mockOnerror();
    await expect(gmFetch('https://any.url')).rejects.toThrow('连接失败');
  });

  test('ontimeout 回调时 reject 并提示超时', async () => {
    mockOntimeout();
    await expect(gmFetch('https://any.url')).rejects.toThrow('超时');
  });

  test('响应体不是合法 JSON 时 reject 并提示解析失败', async () => {
    mockOnload(200, 'not-json{{{');
    await expect(gmFetch('https://any.url')).rejects.toThrow('JSON 解析失败');
  });

  test('请求时不发送 Referer 头（发送假 Referer 会触发服务器防伪造检测）', () => {
    mockOnload(200, '[]');
    gmFetch('https://any.url');
    const callArgs = GM_xmlhttpRequest.mock.calls[0][0];
    expect(callArgs.headers['Referer']).toBeUndefined();
  });

  test('请求时不携带 Origin 头（GET 请求设置 Origin 会触发 CORS 验证）', () => {
    mockOnload(200, '[]');
    gmFetch('https://any.url');
    const callArgs = GM_xmlhttpRequest.mock.calls[0][0];
    expect(callArgs.headers['Origin']).toBeUndefined();
  });

  test('请求时设置 anonymous: true（不携带当前页面 Cookie）', () => {
    mockOnload(200, '[]');
    gmFetch('https://any.url');
    const callArgs = GM_xmlhttpRequest.mock.calls[0][0];
    expect(callArgs.anonymous).toBe(true);
  });

  test('响应体为空时 403 错误信息不包含多余字符', async () => {
    mockOnload(403, '');
    await expect(gmFetch('https://any.url'))
      .rejects.toThrow('网络异常（403）');
  });
});

/* ────────────────────────────────────────────────────────
   测试：apiGenerateEmail
──────────────────────────────────────────────────────── */

describe('apiGenerateEmail', () => {
  beforeEach(() => { GM_xmlhttpRequest.mockClear(); });

  test('返回邮箱数组的第一个元素', async () => {
    mockOnload(200, JSON.stringify(['xyz@1secmail.com', 'other@1secmail.com']));
    const email = await apiGenerateEmail();
    expect(email).toBe('xyz@1secmail.com');
  });

  test('请求 URL 包含 genRandomMailbox action', () => {
    mockOnload(200, JSON.stringify(['a@b.com']));
    apiGenerateEmail();
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('action=genRandomMailbox');
  });

  test('请求 URL 包含 count=1', () => {
    mockOnload(200, JSON.stringify(['a@b.com']));
    apiGenerateEmail();
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('count=1');
  });

  test('API 返回 403 时向上传递错误', async () => {
    mockOnload(403, 'Forbidden');
    await expect(apiGenerateEmail()).rejects.toThrow('403');
  });
});

/* ────────────────────────────────────────────────────────
   测试：apiGetMessages
──────────────────────────────────────────────────────── */

describe('apiGetMessages', () => {
  beforeEach(() => { GM_xmlhttpRequest.mockClear(); });

  test('返回邮件列表数组', async () => {
    const msgs = [{ id: 1, from: 'a@b.com', subject: 'Hello', date: '2026-01-01' }];
    mockOnload(200, JSON.stringify(msgs));
    const result = await apiGetMessages('user', '1secmail.com');
    expect(result).toEqual(msgs);
  });

  test('请求 URL 包含 login 参数', () => {
    mockOnload(200, '[]');
    apiGetMessages('testuser', '1secmail.com');
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('login=testuser');
  });

  test('请求 URL 包含 domain 参数', () => {
    mockOnload(200, '[]');
    apiGetMessages('user', '1secmail.org');
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('domain=1secmail.org');
  });

  test('请求 URL 包含 getMessages action', () => {
    mockOnload(200, '[]');
    apiGetMessages('u', 'd.com');
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('action=getMessages');
  });

  test('空收件箱时返回空数组', async () => {
    mockOnload(200, '[]');
    const result = await apiGetMessages('user', '1secmail.com');
    expect(result).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────
   测试：apiReadMessage
──────────────────────────────────────────────────────── */

describe('apiReadMessage', () => {
  beforeEach(() => { GM_xmlhttpRequest.mockClear(); });

  test('返回邮件详情对象', async () => {
    const msg = { id: 42, subject: 'Test', htmlBody: '<p>Hi</p>', textBody: 'Hi' };
    mockOnload(200, JSON.stringify(msg));
    const result = await apiReadMessage('user', '1secmail.com', 42);
    expect(result).toEqual(msg);
  });

  test('请求 URL 包含 readMessage action', () => {
    mockOnload(200, '{}');
    apiReadMessage('u', 'd.com', 99);
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('action=readMessage');
  });

  test('请求 URL 包含邮件 id', () => {
    mockOnload(200, '{}');
    apiReadMessage('u', 'd.com', 123);
    const url = GM_xmlhttpRequest.mock.calls[0][0].url;
    expect(url).toContain('id=123');
  });
});

/* ────────────────────────────────────────────────────────
   测试：本地存储（GM_getValue / GM_setValue）
──────────────────────────────────────────────────────── */

describe('storage', () => {
  beforeEach(() => {
    GM_getValue.mockClear();
    GM_setValue.mockClear();
  });

  test('readSavedEmail 使用正确的 key 读取存储', () => {
    GM_getValue.mockReturnValueOnce('test@1secmail.com');
    const email = readSavedEmail();
    expect(GM_getValue).toHaveBeenCalledWith(STORAGE_KEY, null);
    expect(email).toBe('test@1secmail.com');
  });

  test('readSavedEmail 无数据时返回 null', () => {
    GM_getValue.mockReturnValueOnce(null);
    expect(readSavedEmail()).toBeNull();
  });

  test('persistEmail 使用正确的 key 保存邮箱', () => {
    persistEmail('user@1secmail.com');
    expect(GM_setValue).toHaveBeenCalledWith(STORAGE_KEY, 'user@1secmail.com');
  });

  test('eraseEmail 将存储值设为 null', () => {
    eraseEmail();
    expect(GM_setValue).toHaveBeenCalledWith(STORAGE_KEY, null);
  });
});
