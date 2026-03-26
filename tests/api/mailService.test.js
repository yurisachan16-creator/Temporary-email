/**
 * mailService 单元测试
 * 覆盖所有与 1secmail API 交互的核心方法
 */
import {
  generateEmail,
  getMessages,
  readMessage,
  deleteMessage,
  getDomainList
} from '../../src/api/mailService';

// 每次测试前清除所有 mock 的调用记录和返回值
beforeEach(() => {
  jest.clearAllMocks();
});

// ─── generateEmail（生成临时邮箱）────────────────────
describe('generateEmail（生成临时邮箱）', () => {
  test('成功时应返回格式正确的邮箱地址字符串', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ['test123@1secmail.com']
    });

    const email = await generateEmail();

    expect(typeof email).toBe('string');
    // 验证返回值符合 xxx@domain.tld 格式
    expect(email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
  });

  test('请求地址应包含 genRandomMailbox 动作参数', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ['test@1secmail.com']
    });

    await generateEmail();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('action=genRandomMailbox')
    );
  });

  test('网络请求失败时应向上抛出错误', async () => {
    fetch.mockRejectedValueOnce(new Error('Network Error'));

    await expect(generateEmail()).rejects.toThrow('Network Error');
  });

  test('服务器返回非 2xx 状态时应抛出错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(generateEmail()).rejects.toThrow();
  });
});

// ─── getMessages（获取收件列表）──────────────────────
describe('getMessages（获取收件列表）', () => {
  // 模拟 API 返回的邮件列表数据
  const mockMessages = [
    { id: 1, from: 'sender@example.com', subject: '验证码', date: '2026-03-26 10:00:00' },
    { id: 2, from: 'no-reply@shop.com', subject: '订单确认', date: '2026-03-26 11:00:00' }
  ];

  test('成功时应返回包含邮件对象的数组', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockMessages });

    const messages = await getMessages('test123', '1secmail.com');

    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(2);
    // 每条邮件必须包含 id、from、subject 字段
    expect(messages[0]).toHaveProperty('id');
    expect(messages[0]).toHaveProperty('from');
    expect(messages[0]).toHaveProperty('subject');
  });

  test('请求 URL 应包含 login 和 domain 参数', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await getMessages('mylogin', 'example.com');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('login=mylogin'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('domain=example.com'));
  });

  test('邮箱为空时应返回空数组', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    const messages = await getMessages('test123', '1secmail.com');

    expect(messages).toEqual([]);
  });

  test('未传入 login 参数时应抛出错误', async () => {
    await expect(getMessages(undefined, '1secmail.com')).rejects.toThrow();
  });

  test('未传入 domain 参数时应抛出错误', async () => {
    await expect(getMessages('test123', undefined)).rejects.toThrow();
  });

  test('服务器返回 429（限流）时应抛出错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(getMessages('test123', '1secmail.com')).rejects.toThrow();
  });
});

// ─── readMessage（读取邮件详情）──────────────────────
describe('readMessage（读取邮件详情）', () => {
  // 模拟 API 返回的邮件详情数据
  const mockDetail = {
    id: 1,
    from: 'sender@example.com',
    subject: '验证码邮件',
    body: '<p>您的验证码是 <strong>123456</strong></p>',
    textBody: '您的验证码是 123456',
    date: '2026-03-26 10:00:00'
  };

  test('成功时应返回包含 body、subject、textBody 的邮件对象', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDetail });

    const message = await readMessage('test123', '1secmail.com', 1);

    expect(message).toHaveProperty('id', 1);
    expect(message).toHaveProperty('body');
    expect(message).toHaveProperty('subject');
    expect(message).toHaveProperty('textBody');
  });

  test('请求 URL 应包含 login、domain 和 id 参数', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDetail });

    await readMessage('user', 'domain.com', 99);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('login=user'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('domain=domain.com'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('id=99'));
  });

  test('邮件不存在（404）时应抛出错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(readMessage('test123', '1secmail.com', 9999)).rejects.toThrow();
  });
});

// ─── deleteMessage（删除邮件）────────────────────────
describe('deleteMessage（删除邮件）', () => {
  test('成功删除时应返回 true', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'deleted' })
    });

    const result = await deleteMessage('test123', '1secmail.com', 1);

    expect(result).toBe(true);
  });

  test('删除不存在的邮件（404）时应抛出错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(deleteMessage('test123', '1secmail.com', 9999)).rejects.toThrow();
  });
});

// ─── getDomainList（获取可用域名列表）──────────────
describe('getDomainList（获取可用域名列表）', () => {
  test('成功时应返回非空的字符串数组', async () => {
    const mockDomains = ['1secmail.com', '1secmail.net', '1secmail.org'];
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockDomains });

    const domains = await getDomainList();

    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBeGreaterThan(0);
    // 每个元素必须是字符串
    domains.forEach(d => expect(typeof d).toBe('string'));
  });
});
