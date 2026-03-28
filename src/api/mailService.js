/**
 * mailService.js
 * 封装临时邮箱服务的所有网络交互：
 *   - 主提供商：1secmail
 *   - 备用提供商：mail.tm
 *
 * 浏览器扩展与测试统一依赖此文件，避免各端重复维护接口逻辑。
 */

const ONE_SEC_MAIL_BASE = 'https://www.1secmail.com/api/v1/';
const MAIL_TM_BASE      = 'https://api.mail.tm';
const REQUEST_TIMEOUT   = 10_000;

export const PROVIDERS = Object.freeze({
  oneSecMail: '1secmail',
  mailTm:     'mailtm',
});

const DOMAIN_TIERS = {
  cold:   ['xojxe.com', 'yoggm.com', 'esiix.com'],
  medium: ['wwjmp.com', 'kzccv.com', 'qiott.com'],
  known:  ['1secmail.org', '1secmail.net', '1secmail.com'],
};

const DOMAIN_TIER_PRIORITY = [
  ...DOMAIN_TIERS.cold,
  ...DOMAIN_TIERS.medium,
  ...DOMAIN_TIERS.known,
];

const DOMAIN_TIER_LABELS = {
  zh: {
    cold:   '🟢 冷门',
    medium: '🟡 中等',
    known:  '🔴 常见',
  },
  en: {
    cold:   '🟢 Low Profile',
    medium: '🟡 Medium',
    known:  '🔴 Common',
  },
};

let cachedDomains = null;

/**
 * 重置内部缓存（仅供测试使用）
 * @returns {void}
 */
export function __resetMailServiceCache() {
  cachedDomains = null;
}

/**
 * 创建统一的 HTTP 错误对象
 * @param {number} status
 * @param {string} responseText
 * @returns {Error}
 */
function createHttpError(status, responseText = '') {
  const error = new Error(`请求失败，状态码：${status}`);
  error.status = status;
  error.responseText = responseText;
  return error;
}

/**
 * 创建统一的传输层错误对象
 * @param {string} code
 * @param {string} message
 * @returns {Error}
 */
function createTransportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * 发送带超时控制的 fetch 请求并解析 JSON
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error && error.name === 'AbortError') {
      throw createTransportError('TIMEOUT', '请求超时');
    }
    throw createTransportError('NETWORK', error?.message || '网络请求失败');
  }

  clearTimeout(timer);

  if (!response.ok) {
    let responseText = '';
    try {
      responseText = await response.text();
    } catch {
      responseText = '';
    }
    throw createHttpError(response.status, responseText);
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败');
  }
}

/**
 * 生成随机 login，避免碰撞
 * @returns {string}
 */
function generateRandomLogin() {
  return `tmplus${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成 mail.tm 临时密码
 * @returns {string}
 */
function generateTempPassword() {
  return `P${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * 判断 provider 是否为 mail.tm
 * @param {string} provider
 * @returns {boolean}
 */
function isMailTmProvider(provider) {
  return provider === PROVIDERS.mailTm || provider === 'mail.tm';
}

/**
 * 按邮箱地址构造会话对象
 * @param {string} email
 * @param {string} provider
 * @param {object} [extra]
 * @returns {object}
 */
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

/**
 * 将邮箱对象标准化为统一结构
 * @param {object|string} mailbox
 * @returns {{ address: string, provider: string }}
 */
function normalizeMailbox(mailbox) {
  if (typeof mailbox === 'string') {
    return { address: mailbox, provider: PROVIDERS.oneSecMail };
  }

  return {
    address:  mailbox.address,
    provider: mailbox.provider || PROVIDERS.oneSecMail,
  };
}

/**
 * 判断是否需要回退到 mail.tm
 * @param {Error} error
 * @returns {boolean}
 */
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

/**
 * 将发件人格式化为可读文本
 * @param {string|object} sender
 * @returns {string}
 */
function formatSender(sender) {
  if (!sender) return '';
  if (typeof sender === 'string') return sender;
  if (sender.name && sender.address) return `${sender.name} <${sender.address}>`;
  return sender.address || sender.name || '';
}

/**
 * 归一化 mail.tm 邮件列表
 * @param {object} data
 * @returns {Array<object>}
 */
function normalizeMailTmMessages(data) {
  const items = Array.isArray(data?.['hydra:member'])
    ? data['hydra:member']
    : [];

  return items.map((item) => ({
    id:      item.id,
    from:    formatSender(item.from),
    subject: item.subject || '',
    date:    item.createdAt || item.updatedAt || '',
  }));
}

/**
 * 归一化 mail.tm 邮件详情
 * @param {object} data
 * @returns {object}
 */
function normalizeMailTmMessage(data) {
  const htmlBody = Array.isArray(data?.html)
    ? data.html.join('\n')
    : (typeof data?.html === 'string' ? data.html : '');

  return {
    id:       data.id,
    from:     formatSender(data.from),
    subject:  data.subject || '',
    date:     data.createdAt || data.updatedAt || '',
    htmlBody,
    textBody: data.text || '',
  };
}

/**
 * 获取 1secmail 域名列表（带缓存）
 * @returns {Promise<string[]>}
 */
async function getCachedDomainList() {
  if (cachedDomains) return cachedDomains;

  cachedDomains = await requestJson(`${ONE_SEC_MAIL_BASE}?action=getDomainList`);
  return cachedDomains;
}

/**
 * 选取最优的 1secmail 域名
 * @returns {Promise<string>}
 */
async function getBestDomain() {
  const available = await getCachedDomainList();
  for (const domain of DOMAIN_TIER_PRIORITY) {
    if (available.includes(domain)) return domain;
  }
  return available[available.length - 1] ?? '1secmail.com';
}

/**
 * 获取当前 mail.tm 可用域名
 * @returns {Promise<string>}
 */
async function mailTmGetDomain() {
  const data = await requestJson(`${MAIL_TM_BASE}/domains`);
  const domains = Array.isArray(data?.['hydra:member'])
    ? data['hydra:member']
    : [];

  const active = domains.find((item) => item.isActive && !item.isPrivate) || domains[0];
  if (!active?.domain) {
    throw new Error('mail.tm 域名列表为空');
  }

  return active.domain;
}

/**
 * 创建 mail.tm 会话
 * @returns {Promise<object>}
 */
async function createMailTmSession() {
  const domain = await mailTmGetDomain();
  const password = generateTempPassword();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const login = generateRandomLogin();
    const email = `${login}@${domain}`;

    try {
      const account = await requestJson(`${MAIL_TM_BASE}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: email, password }),
      });

      const tokenData = await requestJson(`${MAIL_TM_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: email, password }),
      });

      return buildSession(email, PROVIDERS.mailTm, {
        accountId: account?.id,
        password,
        token: tokenData?.token,
      });
    } catch (error) {
      if (error.status !== 422 || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error('mail.tm 账号创建失败');
}

/**
 * 获取可用的 mail.tm Token；必要时重新申请
 * @param {object} session
 * @param {boolean} [forceRefresh]
 * @returns {Promise<string>}
 */
async function ensureMailTmToken(session, forceRefresh = false) {
  if (!forceRefresh && session.token) {
    return session.token;
  }

  if (!session.password) {
    throw new Error('缺少 mail.tm 会话凭据');
  }

  const tokenData = await requestJson(`${MAIL_TM_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address:  session.email,
      password: session.password,
    }),
  });

  session.token = tokenData?.token;
  return session.token;
}

/**
 * 发起带认证的 mail.tm 请求；401 时自动刷新 Token 后重试
 * @param {object} session
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function mailTmRequest(session, path, options = {}) {
  const execute = async () => {
    const token = await ensureMailTmToken(session);
    return requestJson(`${MAIL_TM_BASE}${path}`, {
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

/**
 * 获取指定邮箱对应的会话
 * @param {object|string} mailbox
 * @param {object|null} session
 * @returns {object}
 */
function resolveSession(mailbox, session = null) {
  const normalized = normalizeMailbox(mailbox);

  if (session?.email === normalized.address) {
    return session;
  }

  if (isMailTmProvider(normalized.provider)) {
    if (!session) {
      throw new Error('缺少 mail.tm 会话');
    }
    return session;
  }

  return buildSession(normalized.address, PROVIDERS.oneSecMail);
}

/**
 * 返回域名信誉标签
 * @param {string} domain
 * @param {'zh'|'en'} [language]
 * @returns {string}
 */
export function getDomainTierLabel(domain, language = 'zh') {
  const labels = DOMAIN_TIER_LABELS[language] || DOMAIN_TIER_LABELS.zh;

  if (DOMAIN_TIERS.cold.includes(domain)) return labels.cold;
  if (DOMAIN_TIERS.medium.includes(domain)) return labels.medium;
  if (DOMAIN_TIERS.known.includes(domain)) return labels.known;

  return labels.medium;
}

/**
 * 生成新的邮箱记录；失败时自动回退 mail.tm
 * @returns {Promise<{address:string,provider:string,session:object}>}
 */
export async function generateMailbox() {
  try {
    const domain = await getBestDomain();
    const login = Math.random().toString(36).slice(2, 14);
    const session = buildSession(`${login}@${domain}`, PROVIDERS.oneSecMail);

    return {
      address:  session.email,
      provider: session.provider,
      session,
    };
  } catch (error) {
    if (!shouldFallbackToMailTm(error)) {
      throw error;
    }

    const session = await createMailTmSession();
    return {
      address:  session.email,
      provider: session.provider,
      session,
    };
  }
}

/**
 * 获取指定邮箱的收件列表
 * @param {object|string} mailbox
 * @param {object|null} [session]
 * @returns {Promise<{messages:Array<object>,session:object}>}
 */
export async function getMailboxMessages(mailbox, session = null) {
  const normalized = normalizeMailbox(mailbox);
  const resolvedSession = resolveSession(normalized, session);

  if (isMailTmProvider(normalized.provider)) {
    const data = await mailTmRequest(resolvedSession, '/messages');
    return {
      messages: normalizeMailTmMessages(data),
      session:  resolvedSession,
    };
  }

  const { login, domain } = resolvedSession;
  const messages = await requestJson(
    `${ONE_SEC_MAIL_BASE}?action=getMessages&login=${login}&domain=${domain}`
  );

  return {
    messages,
    session: resolvedSession,
  };
}

/**
 * 读取指定邮箱中的单封邮件
 * @param {object|string} mailbox
 * @param {object|null} session
 * @param {string|number} id
 * @returns {Promise<{message:object,session:object}>}
 */
export async function readMailboxMessage(mailbox, session, id) {
  const normalized = normalizeMailbox(mailbox);
  const resolvedSession = resolveSession(normalized, session);

  if (isMailTmProvider(normalized.provider)) {
    const data = await mailTmRequest(resolvedSession, `/messages/${id}`);
    return {
      message: normalizeMailTmMessage(data),
      session: resolvedSession,
    };
  }

  const { login, domain } = resolvedSession;
  const message = await requestJson(
    `${ONE_SEC_MAIL_BASE}?action=readMessage&login=${login}&domain=${domain}&id=${id}`
  );

  return {
    message,
    session: resolvedSession,
  };
}

/**
 * 丢弃指定邮箱的远端会话
 * @param {object|string} mailbox
 * @param {object|null} session
 * @returns {Promise<boolean>}
 */
export async function discardMailboxSession(mailbox, session = null) {
  const normalized = normalizeMailbox(mailbox);
  const resolvedSession = resolveSession(normalized, session);

  if (!isMailTmProvider(normalized.provider) || !resolvedSession.accountId) {
    return false;
  }

  try {
    await mailTmRequest(resolvedSession, `/accounts/${resolvedSession.accountId}`, {
      method: 'DELETE',
    });
  } catch {
    return false;
  }

  return true;
}

/**
 * 生成一个随机临时邮箱地址（兼容旧接口）
 * @returns {Promise<string>}
 */
export async function generateEmail() {
  const mailbox = await generateMailbox();
  return mailbox.address;
}

/**
 * 获取指定邮箱的收件列表（兼容旧接口，仅 1secmail）
 * @param {string} login
 * @param {string} domain
 * @returns {Promise<Array<object>>}
 */
export async function getMessages(login, domain) {
  if (login === undefined || login === null) throw new Error('缺少 login 参数');
  if (domain === undefined || domain === null) throw new Error('缺少 domain 参数');

  const { messages } = await getMailboxMessages({
    address:  `${login}@${domain}`,
    provider: PROVIDERS.oneSecMail,
  });

  return messages;
}

/**
 * 读取指定邮件的完整内容（兼容旧接口，仅 1secmail）
 * @param {string} login
 * @param {string} domain
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function readMessage(login, domain, id) {
  const { message } = await readMailboxMessage({
    address:  `${login}@${domain}`,
    provider: PROVIDERS.oneSecMail,
  }, null, id);

  return message;
}

/**
 * 删除指定邮件（兼容旧接口，仅 1secmail）
 * @param {string} login
 * @param {string} domain
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteMessage(login, domain, id) {
  await requestJson(
    `${ONE_SEC_MAIL_BASE}?action=deleteMessage&login=${login}&domain=${domain}&id=${id}`
  );
  return true;
}

/**
 * 获取当前可用域名列表（兼容旧接口）
 * @returns {Promise<string[]>}
 */
export async function getDomainList() {
  return getCachedDomainList();
}
