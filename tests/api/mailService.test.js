/**
 * mailService 单元测试
 * 覆盖浏览器扩展共享邮件服务的主路径：
 *   - 1secmail 冷门域名优先
 *   - 403/429/5xx/网络失败回退 mail.tm
 *   - mail.tm token 刷新、消息归一化、账号删除
 *   - 域名信誉标签映射
 */
import {
  PROVIDERS,
  __resetMailServiceCache,
  generateEmail,
  generateMailbox,
  getMessages,
  getMailboxMessages,
  readMessage,
  readMailboxMessage,
  deleteMessage,
  getDomainList,
  getDomainTierLabel,
  discardMailboxSession,
} from '../../src/api/mailService';

/**
 * 生成模拟 JSON 响应
 * @param {number} status
 * @param {any} data
 * @returns {object}
 */
function createJsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

/**
 * 生成模拟文本响应
 * @param {number} status
 * @param {string} text
 * @returns {object}
 */
function createTextResponse(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

beforeEach(() => {
  fetch.mockReset();
  jest.useRealTimers();
  __resetMailServiceCache();
});

describe('generateMailbox（生成邮箱）', () => {
  test('1secmail 可用时优先使用冷门域名', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(200, ['1secmail.com', 'xojxe.com']));

    const mailbox = await generateMailbox();

    expect(mailbox.provider).toBe(PROVIDERS.oneSecMail);
    expect(mailbox.address).toMatch(/@xojxe\.com$/);
    expect(mailbox.session.email).toBe(mailbox.address);
  });

  test('getDomainList 返回 403 时自动回退到 mail.tm', async () => {
    fetch
      .mockResolvedValueOnce(createTextResponse(403, 'Forbidden'))
      .mockResolvedValueOnce(createJsonResponse(200, {
        'hydra:member': [{ domain: 'mail.tm', isActive: true, isPrivate: false }],
      }))
      .mockResolvedValueOnce(createJsonResponse(201, { id: 'acc_1' }))
      .mockResolvedValueOnce(createJsonResponse(200, { token: 'token_1' }));

    const mailbox = await generateMailbox();

    expect(mailbox.provider).toBe(PROVIDERS.mailTm);
    expect(mailbox.address).toMatch(/@mail\.tm$/);
    expect(mailbox.session).toMatchObject({
      provider: PROVIDERS.mailTm,
      accountId: 'acc_1',
      token: 'token_1',
    });
  });

  test('网络失败时也会回退到 mail.tm', async () => {
    fetch
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(createJsonResponse(200, {
        'hydra:member': [{ domain: 'mail.tm', isActive: true, isPrivate: false }],
      }))
      .mockResolvedValueOnce(createJsonResponse(201, { id: 'acc_network' }))
      .mockResolvedValueOnce(createJsonResponse(200, { token: 'token_network' }));

    const mailbox = await generateMailbox();

    expect(mailbox.provider).toBe(PROVIDERS.mailTm);
    expect(mailbox.session.accountId).toBe('acc_network');
  });

  test('mail.tm 创建账号遇到 422 时会重试用户名', async () => {
    fetch
      .mockResolvedValueOnce(createTextResponse(403, 'Forbidden'))
      .mockResolvedValueOnce(createJsonResponse(200, {
        'hydra:member': [{ domain: 'mail.tm', isActive: true, isPrivate: false }],
      }))
      .mockResolvedValueOnce(createJsonResponse(422, {}))
      .mockResolvedValueOnce(createJsonResponse(201, { id: 'acc_retry' }))
      .mockResolvedValueOnce(createJsonResponse(200, { token: 'token_retry' }));

    const mailbox = await generateMailbox();

    expect(mailbox.provider).toBe(PROVIDERS.mailTm);
    expect(mailbox.session.accountId).toBe('acc_retry');
  });
});

describe('兼容旧接口', () => {
  test('generateEmail 返回纯邮箱字符串', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(200, ['xojxe.com']));

    const email = await generateEmail();

    expect(typeof email).toBe('string');
    expect(email).toMatch(/@xojxe\.com$/);
  });

  test('getMessages 返回 1secmail 收件数组', async () => {
    const messages = [{ id: 1, from: 'sender@example.com', subject: '验证码', date: '2026-03-26' }];
    fetch.mockResolvedValueOnce(createJsonResponse(200, messages));

    await expect(getMessages('user', '1secmail.com')).resolves.toEqual(messages);
  });

  test('readMessage 返回 1secmail 邮件详情', async () => {
    const detail = {
      id: 1,
      from: 'sender@example.com',
      subject: '验证码邮件',
      htmlBody: '<p>Hello</p>',
      textBody: 'Hello',
      date: '2026-03-26',
    };
    fetch.mockResolvedValueOnce(createJsonResponse(200, detail));

    await expect(readMessage('user', '1secmail.com', 1)).resolves.toEqual(detail);
  });

  test('deleteMessage 删除成功时返回 true', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(200, { status: 'deleted' }));

    await expect(deleteMessage('user', '1secmail.com', 1)).resolves.toBe(true);
  });

  test('getDomainList 首次请求后返回缓存', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(200, ['xojxe.com', '1secmail.com']));

    const first = await getDomainList();
    const second = await getDomainList();

    expect(first).toEqual(['xojxe.com', '1secmail.com']);
    expect(second).toEqual(['xojxe.com', '1secmail.com']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('getMailboxMessages（收件列表）', () => {
  test('1secmail 模式返回原始邮件列表', async () => {
    const messages = [{ id: 1, from: 'a@b.com', subject: 'Hello', date: '2026-01-01' }];
    fetch.mockResolvedValueOnce(createJsonResponse(200, messages));

    const result = await getMailboxMessages({
      address: 'user@1secmail.com',
      provider: PROVIDERS.oneSecMail,
    });

    expect(result.messages).toEqual(messages);
    expect(result.session.provider).toBe(PROVIDERS.oneSecMail);
  });

  test('mail.tm 模式会归一化邮件列表并保留 Bearer token', async () => {
    const session = {
      provider: PROVIDERS.mailTm,
      email: 'user@mail.tm',
      password: 'pwd',
      token: 'token_1',
      login: 'user',
      domain: 'mail.tm',
    };
    fetch.mockResolvedValueOnce(createJsonResponse(200, {
      'hydra:member': [{
        id: 'msg_1',
        from: { name: 'Sender', address: 'sender@example.com' },
        subject: 'Hello',
        createdAt: '2026-03-26T12:00:00.000Z',
      }],
    }));

    const result = await getMailboxMessages({
      address: 'user@mail.tm',
      provider: PROVIDERS.mailTm,
    }, session);

    expect(result.messages).toEqual([{
      id: 'msg_1',
      from: 'Sender <sender@example.com>',
      subject: 'Hello',
      date: '2026-03-26T12:00:00.000Z',
    }]);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token_1');
  });

  test('mail.tm 请求 401 时会刷新 token 后重试', async () => {
    const session = {
      provider: PROVIDERS.mailTm,
      email: 'user@mail.tm',
      password: 'pwd',
      token: 'old_token',
      login: 'user',
      domain: 'mail.tm',
    };

    fetch
      .mockResolvedValueOnce(createTextResponse(401, 'Unauthorized'))
      .mockResolvedValueOnce(createJsonResponse(200, { token: 'new_token' }))
      .mockResolvedValueOnce(createJsonResponse(200, { 'hydra:member': [] }));

    const result = await getMailboxMessages({
      address: 'user@mail.tm',
      provider: PROVIDERS.mailTm,
    }, session);

    expect(result.messages).toEqual([]);
    expect(result.session.token).toBe('new_token');
  });
});

describe('readMailboxMessage（邮件详情）', () => {
  test('1secmail 模式返回原始详情', async () => {
    const detail = { id: 42, subject: 'Test', htmlBody: '<p>Hi</p>', textBody: 'Hi' };
    fetch.mockResolvedValueOnce(createJsonResponse(200, detail));

    const result = await readMailboxMessage({
      address: 'user@1secmail.com',
      provider: PROVIDERS.oneSecMail,
    }, null, 42);

    expect(result.message).toEqual(detail);
  });

  test('mail.tm 模式会归一化详情并支持字符串 ID', async () => {
    const session = {
      provider: PROVIDERS.mailTm,
      email: 'user@mail.tm',
      password: 'pwd',
      token: 'token_1',
      login: 'user',
      domain: 'mail.tm',
    };
    fetch.mockResolvedValueOnce(createJsonResponse(200, {
      id: 'msg_1',
      from: { address: 'sender@example.com' },
      subject: 'Subject',
      createdAt: '2026-03-26T12:00:00.000Z',
      html: ['<p>Hello</p>'],
      text: 'Hello',
    }));

    const result = await readMailboxMessage({
      address: 'user@mail.tm',
      provider: PROVIDERS.mailTm,
    }, session, 'msg_1');

    expect(result.message).toEqual({
      id: 'msg_1',
      from: 'sender@example.com',
      subject: 'Subject',
      date: '2026-03-26T12:00:00.000Z',
      htmlBody: '<p>Hello</p>',
      textBody: 'Hello',
    });
  });
});

describe('discardMailboxSession（丢弃会话）', () => {
  test('mail.tm 会话会请求删除远端账号', async () => {
    const session = {
      provider: PROVIDERS.mailTm,
      email: 'user@mail.tm',
      password: 'pwd',
      token: 'token_1',
      accountId: 'acc_1',
      login: 'user',
      domain: 'mail.tm',
    };
    fetch.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });

    const deleted = await discardMailboxSession({
      address: 'user@mail.tm',
      provider: PROVIDERS.mailTm,
    }, session);

    expect(deleted).toBe(true);
    expect(fetch.mock.calls[0][0]).toContain('/accounts/acc_1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  test('1secmail 会话丢弃时直接跳过', async () => {
    const deleted = await discardMailboxSession({
      address: 'user@1secmail.com',
      provider: PROVIDERS.oneSecMail,
    });

    expect(deleted).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('getDomainTierLabel（域名信誉标签）', () => {
  test('中文模式返回中文标签', () => {
    expect(getDomainTierLabel('xojxe.com')).toBe('🟢 冷门');
    expect(getDomainTierLabel('wwjmp.com')).toBe('🟡 中等');
    expect(getDomainTierLabel('1secmail.com')).toBe('🔴 常见');
  });

  test('英文模式返回英文标签', () => {
    expect(getDomainTierLabel('xojxe.com', 'en')).toBe('🟢 Low Profile');
    expect(getDomainTierLabel('wwjmp.com', 'en')).toBe('🟡 Medium');
    expect(getDomainTierLabel('1secmail.com', 'en')).toBe('🔴 Common');
  });
});
