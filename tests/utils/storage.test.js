/**
 * storage 单元测试
 * 覆盖 browser.storage.local 封装的所有读写方法
 *
 * 存储键名约定（实现代码必须与此一致）：
 *   currentEmail — 当前使用的单个邮箱地址
 *   emailList    — 多邮箱模式下的邮箱列表（最多 5 个）
 */
import {
  saveEmail,
  getEmail,
  clearEmail,
  getAllEmails,
  saveAllEmails
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
