/**
 * storage 单元测试
 * 覆盖 browser.storage.local 封装的所有读写方法
 *
 * 存储键名约定（实现代码必须与此一致）：
 *   currentEmail    — 当前使用的单个邮箱地址（v1.x）
 *   emailList       — 多邮箱字符串数组（v1.x，最多 5 个）
 *   mailboxes       — 多邮箱对象数组（v2.0）
 *   activeMailboxId — 当前激活邮箱 ID（v2.0）
 *   theme           — 主题偏好 'auto' | 'light' | 'dark'（v2.0）
 */
import {
  saveEmail,
  getEmail,
  clearEmail,
  getAllEmails,
  saveAllEmails,
  getAllMailboxes,
  addMailbox,
  removeMailbox,
  getActiveMailboxId,
  setActiveMailboxId,
  getTheme,
  setTheme,
} from '../../src/utils/storage';

// 每次测试前清空 storage，保证测试之间互相隔离
beforeEach(async () => {
  await browser.storage.local.clear();
});

// ─── saveEmail（保存当前邮箱）────────────────────────
describe('saveEmail（保存当前邮箱）', () => {
  test('应将邮箱以 currentEmail 为键写入 storage', async () => {
    await saveEmail('abc@1secmail.com');

    const result = await browser.storage.local.get('currentEmail');
    expect(result.currentEmail).toBe('abc@1secmail.com');
  });

  test('多次调用时应覆盖旧的邮箱地址', async () => {
    await saveEmail('old@1secmail.com');
    await saveEmail('new@1secmail.com');

    const result = await browser.storage.local.get('currentEmail');
    expect(result.currentEmail).toBe('new@1secmail.com');
  });

  test('传入空字符串时应抛出错误', async () => {
    await expect(saveEmail('')).rejects.toThrow();
  });

  test('传入不含 @ 的字符串时应抛出错误', async () => {
    await expect(saveEmail('not-an-email')).rejects.toThrow();
  });

  test('传入 null 时应抛出错误', async () => {
    await expect(saveEmail(null)).rejects.toThrow();
  });
});

// ─── getEmail（读取当前邮箱）────────────────────────
describe('getEmail（读取当前邮箱）', () => {
  test('存在保存值时应返回对应的邮箱字符串', async () => {
    await browser.storage.local.set({ currentEmail: 'abc@1secmail.com' });

    const email = await getEmail();

    expect(email).toBe('abc@1secmail.com');
  });

  test('从未保存过邮箱时应返回 null', async () => {
    const email = await getEmail();

    expect(email).toBeNull();
  });
});

// ─── clearEmail（清除当前邮箱）──────────────────────
describe('clearEmail（清除当前邮箱）', () => {
  test('清除后 getEmail 应返回 null', async () => {
    await browser.storage.local.set({ currentEmail: 'abc@1secmail.com' });

    await clearEmail();

    expect(await getEmail()).toBeNull();
  });

  test('storage 中不存在邮箱时调用也不应抛出错误', async () => {
    await expect(clearEmail()).resolves.not.toThrow();
  });
});

// ─── getAllEmails（获取所有已保存邮箱列表）──────────
describe('getAllEmails（获取邮箱列表）', () => {
  test('无保存记录时应返回空数组', async () => {
    const emails = await getAllEmails();

    expect(emails).toEqual([]);
  });

  test('有保存记录时应完整返回数组', async () => {
    await browser.storage.local.set({
      emailList: ['a@1secmail.com', 'b@1secmail.com']
    });

    const emails = await getAllEmails();

    expect(emails).toEqual(['a@1secmail.com', 'b@1secmail.com']);
  });
});

// ─── saveAllEmails（保存邮箱列表）───────────────────
describe('saveAllEmails（保存邮箱列表）', () => {
  test('应将数组以 emailList 为键写入 storage', async () => {
    await saveAllEmails(['a@1secmail.com', 'b@1secmail.com']);

    const result = await browser.storage.local.get('emailList');
    expect(result.emailList).toEqual(['a@1secmail.com', 'b@1secmail.com']);
  });

  test('保存后 getAllEmails 应能正确读回相同的值', async () => {
    const list = ['x@1secmail.com', 'y@1secmail.com'];
    await saveAllEmails(list);

    expect(await getAllEmails()).toEqual(list);
  });

  test('超过 5 个邮箱时应抛出错误（PRD 限制最多 5 个）', async () => {
    const tooMany = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'];

    await expect(saveAllEmails(tooMany)).rejects.toThrow();
  });

  test('传入空数组时应正常保存，不抛出错误', async () => {
    await expect(saveAllEmails([])).resolves.not.toThrow();
  });
});

// ─── getAllMailboxes（获取 v2.0 邮箱对象列表）────────
describe('getAllMailboxes（获取邮箱对象列表）', () => {
  test('无保存记录时应返回空数组', async () => {
    const mailboxes = await getAllMailboxes();

    expect(mailboxes).toEqual([]);
  });

  test('有保存记录时应完整返回对象数组', async () => {
    const stored = [
      { id: 'id1', address: 'a@xojxe.com', label: '测试', createdAt: 1000, provider: '1secmail' }
    ];
    await browser.storage.local.set({ mailboxes: stored });

    const mailboxes = await getAllMailboxes();

    expect(mailboxes).toEqual(stored);
  });
});

// ─── addMailbox（新增邮箱对象）──────────────────────
describe('addMailbox（新增邮箱对象）', () => {
  test('成功时应返回包含所有必填字段的邮箱对象', async () => {
    const mailbox = await addMailbox({ address: 'test@xojxe.com' });

    expect(mailbox).toHaveProperty('id');
    expect(mailbox).toHaveProperty('address', 'test@xojxe.com');
    expect(mailbox).toHaveProperty('label', '');
    expect(mailbox).toHaveProperty('createdAt');
    expect(mailbox).toHaveProperty('provider', '1secmail');
    // createdAt 应为合理的时间戳（大于 2026-01-01）
    expect(mailbox.createdAt).toBeGreaterThan(1735689600000);
  });

  test('传入 label 时应保存到返回对象', async () => {
    const mailbox = await addMailbox({ address: 'a@xojxe.com', label: 'Steam' });

    expect(mailbox.label).toBe('Steam');
  });

  test('label 超过 20 字符时应自动截断', async () => {
    const longLabel = '这是一个超过二十字符限制的备注标签名称很长很长';
    const mailbox = await addMailbox({ address: 'a@xojxe.com', label: longLabel });

    expect(mailbox.label.length).toBeLessThanOrEqual(20);
  });

  test('传入自定义 provider 时应保存到返回对象', async () => {
    const mailbox = await addMailbox({ address: 'a@mail.tm', provider: 'mail.tm' });

    expect(mailbox.provider).toBe('mail.tm');
  });

  test('新增后 getAllMailboxes 应包含该邮箱', async () => {
    await addMailbox({ address: 'a@xojxe.com' });

    const all = await getAllMailboxes();

    expect(all).toHaveLength(1);
    expect(all[0].address).toBe('a@xojxe.com');
  });

  test('传入无效邮箱地址时应抛出错误', async () => {
    await expect(addMailbox({ address: 'not-valid' })).rejects.toThrow();
  });

  test('已有 5 个邮箱时应抛出「最多 5 个」错误', async () => {
    // 先填满 5 个
    for (let i = 0; i < 5; i++) {
      await addMailbox({ address: `box${i}@xojxe.com` });
    }

    await expect(addMailbox({ address: 'extra@xojxe.com' })).rejects.toThrow();
  });

  test('多次新增后 getAllMailboxes 应保留全部邮箱', async () => {
    await addMailbox({ address: 'a@xojxe.com' });
    await addMailbox({ address: 'b@xojxe.com' });

    const all = await getAllMailboxes();

    expect(all).toHaveLength(2);
  });
});

// ─── removeMailbox（删除邮箱对象）───────────────────
describe('removeMailbox（删除邮箱对象）', () => {
  test('删除后 getAllMailboxes 不再包含该邮箱', async () => {
    const mb = await addMailbox({ address: 'a@xojxe.com' });

    await removeMailbox(mb.id);

    const all = await getAllMailboxes();
    expect(all.find(m => m.id === mb.id)).toBeUndefined();
  });

  test('删除不存在的 ID 时不应抛出错误，列表保持不变', async () => {
    await addMailbox({ address: 'a@xojxe.com' });

    await expect(removeMailbox('non-existent-id')).resolves.not.toThrow();

    const all = await getAllMailboxes();
    expect(all).toHaveLength(1);
  });

  test('删除当前激活邮箱时，激活 ID 应切换到剩余第一个', async () => {
    const mb1 = await addMailbox({ address: 'a@xojxe.com' });
    const mb2 = await addMailbox({ address: 'b@xojxe.com' });
    await setActiveMailboxId(mb1.id);

    await removeMailbox(mb1.id);

    const activeId = await getActiveMailboxId();
    expect(activeId).toBe(mb2.id);
  });

  test('删除最后一个邮箱时，激活 ID 应变为 null', async () => {
    const mb = await addMailbox({ address: 'a@xojxe.com' });
    await setActiveMailboxId(mb.id);

    await removeMailbox(mb.id);

    const activeId = await getActiveMailboxId();
    expect(activeId).toBeNull();
  });

  test('删除非激活邮箱时，激活 ID 不应改变', async () => {
    const mb1 = await addMailbox({ address: 'a@xojxe.com' });
    const mb2 = await addMailbox({ address: 'b@xojxe.com' });
    await setActiveMailboxId(mb1.id);

    await removeMailbox(mb2.id);

    const activeId = await getActiveMailboxId();
    expect(activeId).toBe(mb1.id);
  });
});

// ─── getActiveMailboxId / setActiveMailboxId ─────────
describe('getActiveMailboxId / setActiveMailboxId（激活邮箱 ID）', () => {
  test('未设置时应返回 null', async () => {
    const id = await getActiveMailboxId();

    expect(id).toBeNull();
  });

  test('设置后应能正确读回', async () => {
    await setActiveMailboxId('test-id-123');

    const id = await getActiveMailboxId();

    expect(id).toBe('test-id-123');
  });

  test('多次设置时应以最后一次为准', async () => {
    await setActiveMailboxId('id-1');
    await setActiveMailboxId('id-2');

    const id = await getActiveMailboxId();

    expect(id).toBe('id-2');
  });
});

// ─── getTheme / setTheme（主题偏好）─────────────────
describe('getTheme / setTheme（主题偏好）', () => {
  test('未设置时默认返回 "auto"', async () => {
    const theme = await getTheme();

    expect(theme).toBe('auto');
  });

  test('设置 "light" 后应能正确读回', async () => {
    await setTheme('light');

    expect(await getTheme()).toBe('light');
  });

  test('设置 "dark" 后应能正确读回', async () => {
    await setTheme('dark');

    expect(await getTheme()).toBe('dark');
  });

  test('设置 "auto" 后应能正确读回', async () => {
    await setTheme('dark');
    await setTheme('auto');

    expect(await getTheme()).toBe('auto');
  });

  test('传入无效值时应抛出错误', async () => {
    await expect(setTheme('invalid')).rejects.toThrow();
  });

  test('传入无效值后 storage 中的值不应被修改', async () => {
    await setTheme('light');
    await expect(setTheme('xxx')).rejects.toThrow();

    // 原值应保持不变
    expect(await getTheme()).toBe('light');
  });
});
