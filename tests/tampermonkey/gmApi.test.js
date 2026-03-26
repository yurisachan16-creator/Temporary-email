/**
 * tests/tampermonkey/gmApi.test.js
 *
 * 测试 Tampermonkey 版本的核心 API 逻辑。
 *
 * 由于用户脚本（.user.js）不使用 ES Module 导出，
 * 此文件将被测函数以相同逻辑在此重新定义，
 * 通过 mock GM_xmlhttpRequest / GM_getValue / GM_setValue
 * 全局对象进行单元测试。
 */

'use strict';

/* ── 模拟 Tampermonkey 全局 API ── */
global.GM_xmlhttpRequest = jest.fn();
global.GM_getValue       = jest.fn();
global.GM_setValue       = jest.fn();
global.navigator         = { userAgent: 'TestAgent/1.0' };

/* ── 常量（与 user.js 保持一致）── */
const API_BASE    = 'https://www.1secmail.com/api/v1/';
const MAILTM_BASE = 'https://api.mail.tm';
const STORAGE_KEY = 'tm_currentEmail';
const SESSION_KEY = 'tm_providerSession';
const PROVIDERS   = {
  oneSecMail: '1secmail',
  mailTm:     'mailtm',
};

const DOMAIN_TIERS = {
  cold:   { label: '🟢 冷门', domains: ['xojxe.com', 'yoggm.com', 'esiix.com'] },
  medium: { label: '🟡 中等', domains: ['wwjmp.com', 'kzccv.com', 'qiott.com'] },
  known:  { label: '🔴 常见', domains: ['1secmail.org', '1secmail.net', '1secmail.com'] },
};
const COLD_DOMAIN_PRIORITY = [
  ...DOMAIN_TIERS.cold.domains,
  ...DOMAIN_TIERS.medium.domains,
  ...DOMAIN_TIERS.known.domains,
];

let currentSession = null;
let cachedDomains  = null;
let loginSeed = 0;

function createHttpError(status, responseText) {
  const hint = responseText
    ? `：${responseText.slice(0, 120)}`
    : '';
  const error = new Error(`网络异常，请检查连接（${status}${hint}）`);
  error.status = status;
  error.responseText = responseText || '';
  return error;
}

function createTransportError(code, detail) {
  const error = new Error(`网络异常，请检查连接（${detail}）`);
  error.code = code;
  return error;
}

function gmFetch(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    responseType = 'json',
    anonymous = true,
  } = options;

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url,
      timeout: 15_000,
      headers: {
        'User-Agent': navigator.userAgent,
        'Accept':     'application/json, text/plain, */*',
        ...headers,
      },
      anonymous,
      data: body === undefined
        ? undefined
        : (typeof body === 'string' ? body : JSON.stringify(body)),
      onload(res) {
        if (res.status >= 200 && res.status < 300) {
          if (responseType === 'text') {
            resolve(res.responseText || '');
            return;
          }

          if (res.status === 204 || !res.responseText) {
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('JSON 解析失败'));
          }
        } else {
          reject(createHttpError(res.status, res.responseText));
        }
      },
      onerror()   { reject(createTransportError('NETWORK', '连接失败')); },
      ontimeout() { reject(createTransportError('TIMEOUT', '超时')); },
    });
  });
}

function buildSession(email, provider, extra = {}) {
  const [login = '', domain = ''] = String(email || '').split('@');
  return {
    provider,
    email,
    login,
    domain,
    ...extra,
  };
}

function shouldFallbackToMailTm(error) {
  return Boolean(
    error
    && (
      error.code === 'NETWORK'
      || error.code === 'TIMEOUT'
      || error.status === 403
      || error.status === 429
      || error.status >= 500
    )
  );
}

function generateRandomLogin() {
  loginSeed += 1;
  return `tmplus${loginSeed}`;
}

function generateTempPassword() {
  return 'Pfixedpass123';
}

function formatSender(sender) {
  if (!sender) return '';
  if (typeof sender === 'string') return sender;
  if (sender.name && sender.address) return `${sender.name} <${sender.address}>`;
  return sender.address || sender.name || '';
}

function normalizeMailTmMessages(data) {
  const items = Array.isArray(data && data['hydra:member'])
    ? data['hydra:member']
    : [];

  return items.map((item) => ({
    id:      item.id,
    from:    formatSender(item.from),
    subject: item.subject || '',
    date:    item.createdAt || item.updatedAt || '',
  }));
}

function normalizeMailTmMessage(data) {
  return {
    id:       data.id,
    from:     formatSender(data.from),
    subject:  data.subject || '',
    date:     data.createdAt || data.updatedAt || '',
    htmlBody: Array.isArray(data.html) ? data.html.join('\n') : '',
    textBody: data.text || '',
  };
}

async function mailTmGetDomain() {
  const data = await gmFetch(`${MAILTM_BASE}/domains`);
  const domains = Array.isArray(data && data['hydra:member'])
    ? data['hydra:member']
    : [];
  const activeDomain = domains.find((item) => item.isActive && !item.isPrivate) || domains[0];
  if (!activeDomain || !activeDomain.domain) {
    throw new Error('mail.tm 域名列表为空');
  }
  return activeDomain.domain;
}

async function createMailTmSession() {
  const domain = await mailTmGetDomain();
  const password = generateTempPassword();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const login = generateRandomLogin();
    const email = `${login}@${domain}`;

    try {
      const account = await gmFetch(`${MAILTM_BASE}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { address: email, password },
      });
      const tokenData = await gmFetch(`${MAILTM_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { address: email, password },
      });

      return buildSession(email, PROVIDERS.mailTm, {
        accountId: account && account.id,
        password,
        token: tokenData && tokenData.token,
      });
    } catch (error) {
      if (error.status !== 422 || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error('mail.tm 账号创建失败');
}

async function ensureMailTmToken(session, forceRefresh = false) {
  if (!forceRefresh && session.token) {
    return session.token;
  }

  const tokenData = await gmFetch(`${MAILTM_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      address:  session.email,
      password: session.password,
    },
  });

  session.token = tokenData && tokenData.token;
  persistSession(session);
  return session.token;
}

async function mailTmRequest(session, path, options = {}) {
  const execute = async () => {
    const token = await ensureMailTmToken(session);
    return gmFetch(`${MAILTM_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  };

  try {
    return await execute();
  } catch (error) {
    if (error.status !== 401 || !session.password) {
      throw error;
    }

    await ensureMailTmToken(session, true);
    return execute();
  }
}

function resolveSession(login, domain) {
  const email = `${login}@${domain}`;

  if (currentSession && currentSession.email === email) {
    return currentSession;
  }

  const savedSession = readSavedSession();
  if (savedSession && savedSession.email === email) {
    currentSession = savedSession;
    return currentSession;
  }

  currentSession = buildSession(email, PROVIDERS.oneSecMail);
  return currentSession;
}

async function apiGetDomainList() {
  if (cachedDomains) return cachedDomains;
  cachedDomains = await gmFetch(`${API_BASE}?action=getDomainList`);
  return cachedDomains;
}

async function apiGetBestDomain() {
  const available = await apiGetDomainList();
  for (const domain of COLD_DOMAIN_PRIORITY) {
    if (available.includes(domain)) return domain;
  }
  // 偏好列表全未命中时，取列表末位（1secmail 习惯将较新域名放后面）
  return available[available.length - 1] ?? '1secmail.com';
}

function getDomainTierLabel(domain) {
  for (const tier of Object.values(DOMAIN_TIERS)) {
    if (tier.domains.includes(domain)) return tier.label;
  }
  return '🟡 中等'; // 未知域名默认视为中等
}

async function apiGenerateEmail() {
  try {
    const domain = await apiGetBestDomain();
    // 自行生成随机 login，不依赖 genRandomMailbox，以便完全控制域名
    const login = Math.random().toString(36).slice(2, 14);
    currentSession = buildSession(`${login}@${domain}`, PROVIDERS.oneSecMail);
  } catch (error) {
    if (!shouldFallbackToMailTm(error)) {
      throw error;
    }

    currentSession = await createMailTmSession();
  }

  return currentSession.email;
}

async function apiGetMessages(login, domain) {
  const session = resolveSession(login, domain);

  if (session.provider === PROVIDERS.mailTm) {
    const data = await mailTmRequest(session, '/messages');
    return normalizeMailTmMessages(data);
  }

  return gmFetch(`${API_BASE}?action=getMessages&login=${login}&domain=${domain}`);
}

async function apiReadMessage(login, domain, id) {
  const session = resolveSession(login, domain);

  if (session.provider === PROVIDERS.mailTm) {
    const data = await mailTmRequest(session, `/messages/${id}`);
    return normalizeMailTmMessage(data);
  }

  return gmFetch(`${API_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${id}`);
}

async function apiDiscardCurrentSession() {
  if (!currentSession || currentSession.provider !== PROVIDERS.mailTm || !currentSession.accountId) {
    return;
  }

  try {
    await mailTmRequest(currentSession, `/accounts/${currentSession.accountId}`, {
      method: 'DELETE',
    });
  } catch {
    // 丢弃邮箱时只要求本地状态可清空，删除远端失败不应阻塞流程
  }
}

function readSavedEmail()    { return GM_getValue(STORAGE_KEY, null); }
function persistEmail(email) { GM_setValue(STORAGE_KEY, email); }
function eraseEmail()        { GM_setValue(STORAGE_KEY, null); }
function readSavedSession()  { return GM_getValue(SESSION_KEY, null); }
function persistSession(session) {
  persistEmail(session ? session.email : null);
  GM_setValue(SESSION_KEY, session);
}
function eraseSession() {
  eraseEmail();
  GM_setValue(SESSION_KEY, null);
}

function mockOnload(status, body) {
  GM_xmlhttpRequest.mockImplementationOnce(({ onload }) => {
    onload({ status, responseText: body });
  });
}

function mockOnerror() {
  GM_xmlhttpRequest.mockImplementationOnce(({ onerror }) => {
    onerror();
  });
}

function mockOntimeout() {
  GM_xmlhttpRequest.mockImplementationOnce(({ ontimeout }) => {
    ontimeout();
  });
}

describe('gmFetch', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
  });

  test('200 响应时正确解析 JSON 并 resolve', async () => {
    mockOnload(200, JSON.stringify(['abc@1secmail.com']));
    const result = await gmFetch(`${API_BASE}?action=genRandomMailbox&count=1`);
    expect(result).toEqual(['abc@1secmail.com']);
  });

  test('403 响应时 reject 并携带状态码与响应体', async () => {
    mockOnload(403, 'Forbidden');

    try {
      await gmFetch('https://any.url');
      throw new Error('预期应抛出 403 错误');
    } catch (error) {
      expect(error.message).toContain('403');
      expect(error.message).toContain('Forbidden');
    }
  });

  test('onerror 回调时 reject 并提示连接失败', async () => {
    mockOnerror();
    await expect(gmFetch('https://any.url')).rejects.toThrow('连接失败');
  });

  test('ontimeout 回调时 reject 并提示超时', async () => {
    mockOntimeout();
    await expect(gmFetch('https://any.url')).rejects.toThrow('超时');
  });

  test('POST 请求时会发送 JSON body', async () => {
    mockOnload(200, JSON.stringify({ token: 'abc' }));
    await gmFetch('https://any.url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { hello: 'world' },
    });

    const request = GM_xmlhttpRequest.mock.calls[0][0];
    expect(request.method).toBe('POST');
    expect(request.data).toBe(JSON.stringify({ hello: 'world' }));
  });

  test('204 响应时返回 null', async () => {
    mockOnload(204, '');
    await expect(gmFetch('https://any.url')).resolves.toBeNull();
  });

  test('请求时不发送 Referer 和 Origin 头', async () => {
    mockOnload(200, '[]');
    await gmFetch('https://any.url');
    const request = GM_xmlhttpRequest.mock.calls[0][0];
    expect(request.headers.Referer).toBeUndefined();
    expect(request.headers.Origin).toBeUndefined();
  });
});

describe('apiGenerateEmail', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
    currentSession = null;
    cachedDomains  = null;
    loginSeed = 0;
  });

  test('getDomainList 可用时使用冷门域名构造邮箱', async () => {
    // getDomainList 返回包含冷门域名的列表
    mockOnload(200, JSON.stringify(['xojxe.com', '1secmail.com']));

    const email = await apiGenerateEmail();
    expect(email).toMatch(/@xojxe\.com$/);
    expect(currentSession.provider).toBe(PROVIDERS.oneSecMail);
  });

  test('getDomainList 返回列表中无预设域名时使用列表末位域名', async () => {
    // 全部是 COLD_DOMAIN_PRIORITY 未收录的域名
    mockOnload(200, JSON.stringify(['unknowna.com', 'unknownb.com']));

    const email = await apiGenerateEmail();
    // 末位是 unknownb.com
    expect(email).toMatch(/@unknownb\.com$/);
  });

  test('getDomainList 返回 403 时自动回退到 mail.tm', async () => {
    mockOnload(403, 'Forbidden');
    mockOnload(200, JSON.stringify({
      'hydra:member': [{ domain: 'mail.tm', isActive: true, isPrivate: false }],
    }));
    mockOnload(201, JSON.stringify({ id: 'acc_1' }));
    mockOnload(200, JSON.stringify({ token: 'token_1' }));

    const email = await apiGenerateEmail();
    expect(email).toBe('tmplus1@mail.tm');
    expect(currentSession).toMatchObject({
      provider: PROVIDERS.mailTm,
      email: 'tmplus1@mail.tm',
      accountId: 'acc_1',
      token: 'token_1',
    });
  });

  test('mail.tm 创建账号遇到 422 时会重试一次用户名', async () => {
    mockOnload(403, 'Forbidden');
    mockOnload(200, JSON.stringify({
      'hydra:member': [{ domain: 'mail.tm', isActive: true, isPrivate: false }],
    }));
    mockOnload(422, JSON.stringify({}));
    mockOnload(201, JSON.stringify({ id: 'acc_retry' }));
    mockOnload(200, JSON.stringify({ token: 'token_retry' }));

    const email = await apiGenerateEmail();
    expect(email).toBe('tmplus2@mail.tm');
  });
});

describe('apiGetMessages', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
    GM_getValue.mockReset();
    currentSession = null;
    GM_getValue.mockReturnValue(null);
  });

  test('1secmail 模式返回原始邮件列表', async () => {
    const messages = [{ id: 1, from: 'a@b.com', subject: 'Hello', date: '2026-01-01' }];
    mockOnload(200, JSON.stringify(messages));
    await expect(apiGetMessages('user', '1secmail.com')).resolves.toEqual(messages);
  });

  test('mail.tm 模式会归一化邮件列表并携带 Bearer token', async () => {
    currentSession = buildSession('user@mail.tm', PROVIDERS.mailTm, {
      password: 'pwd',
      token: 'token_1',
    });
    mockOnload(200, JSON.stringify({
      'hydra:member': [{
        id: 'msg_1',
        from: { name: 'Sender', address: 'sender@example.com' },
        subject: 'Hello',
        createdAt: '2026-03-26T12:00:00.000Z',
      }],
    }));

    const messages = await apiGetMessages('user', 'mail.tm');
    expect(messages).toEqual([{ 
      id: 'msg_1',
      from: 'Sender <sender@example.com>',
      subject: 'Hello',
      date: '2026-03-26T12:00:00.000Z',
    }]);

    const request = GM_xmlhttpRequest.mock.calls[0][0];
    expect(request.headers.Authorization).toBe('Bearer token_1');
  });

  test('mail.tm 请求 401 时会刷新 token 后重试', async () => {
    currentSession = buildSession('user@mail.tm', PROVIDERS.mailTm, {
      password: 'pwd',
      token: 'old_token',
    });
    mockOnload(401, 'Unauthorized');
    mockOnload(200, JSON.stringify({ token: 'new_token' }));
    mockOnload(200, JSON.stringify({ 'hydra:member': [] }));

    const result = await apiGetMessages('user', 'mail.tm');
    expect(result).toEqual([]);
    expect(currentSession.token).toBe('new_token');
  });
});

describe('apiReadMessage', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
    currentSession = null;
  });

  test('1secmail 模式返回原始邮件详情', async () => {
    const message = { id: 42, subject: 'Test', htmlBody: '<p>Hi</p>', textBody: 'Hi' };
    mockOnload(200, JSON.stringify(message));
    await expect(apiReadMessage('user', '1secmail.com', 42)).resolves.toEqual(message);
  });

  test('mail.tm 模式会归一化详情并支持字符串邮件 ID', async () => {
    currentSession = buildSession('user@mail.tm', PROVIDERS.mailTm, {
      password: 'pwd',
      token: 'token_1',
    });
    mockOnload(200, JSON.stringify({
      id: 'msg_1',
      from: { address: 'sender@example.com' },
      subject: 'Subject',
      createdAt: '2026-03-26T12:00:00.000Z',
      html: ['<p>Hello</p>'],
      text: 'Hello',
    }));

    const message = await apiReadMessage('user', 'mail.tm', 'msg_1');
    expect(message).toEqual({
      id: 'msg_1',
      from: 'sender@example.com',
      subject: 'Subject',
      date: '2026-03-26T12:00:00.000Z',
      htmlBody: '<p>Hello</p>',
      textBody: 'Hello',
    });

    const request = GM_xmlhttpRequest.mock.calls[0][0];
    expect(request.url).toBe(`${MAILTM_BASE}/messages/msg_1`);
  });
});

describe('apiDiscardCurrentSession', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
    currentSession = null;
  });

  test('mail.tm 会话丢弃时会请求删除远端账号', async () => {
    currentSession = buildSession('user@mail.tm', PROVIDERS.mailTm, {
      accountId: 'acc_1',
      password: 'pwd',
      token: 'token_1',
    });
    mockOnload(204, '');

    await apiDiscardCurrentSession();
    const request = GM_xmlhttpRequest.mock.calls[0][0];
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`${MAILTM_BASE}/accounts/acc_1`);
  });
});

describe('storage', () => {
  beforeEach(() => {
    GM_getValue.mockReset();
    GM_setValue.mockReset();
  });

  test('readSavedEmail 使用正确的 key 读取存储', () => {
    GM_getValue.mockReturnValueOnce('test@1secmail.com');
    expect(readSavedEmail()).toBe('test@1secmail.com');
    expect(GM_getValue).toHaveBeenCalledWith(STORAGE_KEY, null);
  });

  test('persistEmail 使用正确的 key 保存邮箱', () => {
    persistEmail('user@1secmail.com');
    expect(GM_setValue).toHaveBeenCalledWith(STORAGE_KEY, 'user@1secmail.com');
  });

  test('eraseEmail 将邮箱值设为 null', () => {
    eraseEmail();
    expect(GM_setValue).toHaveBeenCalledWith(STORAGE_KEY, null);
  });

  test('readSavedSession 使用正确的 key 读取会话', () => {
    const session = { provider: PROVIDERS.mailTm, email: 'user@mail.tm' };
    GM_getValue.mockReturnValueOnce(session);
    expect(readSavedSession()).toEqual(session);
    expect(GM_getValue).toHaveBeenCalledWith(SESSION_KEY, null);
  });

  test('persistSession 同时保存邮箱和会话', () => {
    const session = { provider: PROVIDERS.mailTm, email: 'user@mail.tm' };
    persistSession(session);
    expect(GM_setValue).toHaveBeenNthCalledWith(1, STORAGE_KEY, 'user@mail.tm');
    expect(GM_setValue).toHaveBeenNthCalledWith(2, SESSION_KEY, session);
  });

  test('eraseSession 会同时清除邮箱和会话', () => {
    eraseSession();
    expect(GM_setValue).toHaveBeenNthCalledWith(1, STORAGE_KEY, null);
    expect(GM_setValue).toHaveBeenNthCalledWith(2, SESSION_KEY, null);
  });
});

describe('apiGetDomainList', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
    cachedDomains = null;
  });

  test('首次调用时请求 getDomainList 接口并返回域名数组', async () => {
    mockOnload(200, JSON.stringify(['xojxe.com', '1secmail.com']));
    const result = await apiGetDomainList();
    expect(result).toEqual(['xojxe.com', '1secmail.com']);
    expect(GM_xmlhttpRequest).toHaveBeenCalledTimes(1);
  });

  test('第二次调用时直接返回缓存，不再发起网络请求', async () => {
    mockOnload(200, JSON.stringify(['xojxe.com', '1secmail.com']));
    await apiGetDomainList();
    const second = await apiGetDomainList();
    expect(second).toEqual(['xojxe.com', '1secmail.com']);
    // 只发起了一次请求
    expect(GM_xmlhttpRequest).toHaveBeenCalledTimes(1);
  });

  test('接口请求失败时向上抛出错误', async () => {
    mockOnerror();
    await expect(apiGetDomainList()).rejects.toThrow('连接失败');
  });
});

describe('apiGetBestDomain', () => {
  beforeEach(() => {
    GM_xmlhttpRequest.mockClear();
    cachedDomains = null;
  });

  test('可用列表中存在冷门域名时优先返回冷门域名', async () => {
    mockOnload(200, JSON.stringify(['1secmail.com', 'xojxe.com', 'yoggm.com']));
    await expect(apiGetBestDomain()).resolves.toBe('xojxe.com');
  });

  test('冷门域名不可用时回退到中等域名', async () => {
    mockOnload(200, JSON.stringify(['1secmail.com', 'wwjmp.com']));
    await expect(apiGetBestDomain()).resolves.toBe('wwjmp.com');
  });

  test('所有预设域名都不在列表中时取数组末位', async () => {
    mockOnload(200, JSON.stringify(['unknowndomain1.com', 'unknowndomain2.com']));
    await expect(apiGetBestDomain()).resolves.toBe('unknowndomain2.com');
  });

  test('可用列表为空时返回默认域名 1secmail.com', async () => {
    mockOnload(200, JSON.stringify([]));
    await expect(apiGetBestDomain()).resolves.toBe('1secmail.com');
  });
});

describe('getDomainTierLabel', () => {
  test('冷门域名返回冷门标签', () => {
    expect(getDomainTierLabel('xojxe.com')).toBe('🟢 冷门');
    expect(getDomainTierLabel('yoggm.com')).toBe('🟢 冷门');
    expect(getDomainTierLabel('esiix.com')).toBe('🟢 冷门');
  });

  test('中等域名返回中等标签', () => {
    expect(getDomainTierLabel('wwjmp.com')).toBe('🟡 中等');
    expect(getDomainTierLabel('kzccv.com')).toBe('🟡 中等');
    expect(getDomainTierLabel('qiott.com')).toBe('🟡 中等');
  });

  test('常见域名返回常见标签', () => {
    expect(getDomainTierLabel('1secmail.com')).toBe('🔴 常见');
    expect(getDomainTierLabel('1secmail.org')).toBe('🔴 常见');
    expect(getDomainTierLabel('1secmail.net')).toBe('🔴 常见');
  });

  test('未知域名默认返回中等标签', () => {
    expect(getDomainTierLabel('unknowndomain.com')).toBe('🟡 中等');
    expect(getDomainTierLabel('')).toBe('🟡 中等');
  });
});

