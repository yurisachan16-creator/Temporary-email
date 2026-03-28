'use strict';

/**
 * background.js — 后台服务脚本（v2.1）
 *
 * v2.1 新增：将弹窗改为可移动、可缩放的独立浮动窗口（F-16）
 *   - 点击扩展图标时创建独立 popup 类型窗口
 *   - 若窗口已存在则聚焦而非重复创建
 *   - 监听窗口移动/缩放，自动保存位置和尺寸
 *   - 下次打开时恢复上次的位置和尺寸
 *
 * 兼容性：
 *   Chrome MV3 — chrome.action.onClicked + chrome.windows.*
 *   Firefox MV2 — browser.browserAction.onClicked + browser.windows.*
 */

// 兼容层：Chrome MV3 使用 chrome.*，Firefox MV2 使用原生 browser.*
const ext = typeof browser !== 'undefined' ? browser : chrome;
// 兼容 MV3 的 action 和 MV2 的 browserAction
const actionAPI = ext.action || ext.browserAction;

// 默认窗口尺寸（首次打开时使用）
const DEFAULT_WIDTH  = 400;
const DEFAULT_HEIGHT = 600;

// storage 中用于记录当前弹窗窗口 ID 的键名
const KEY_WINDOW_ID = 'popupWindowId';
const KEY_BOUNDS    = 'windowBounds';

/**
 * 打开插件独立窗口。
 * 若已有窗口处于打开状态则聚焦该窗口，不重复创建。
 */
async function openOrFocusWindow() {
  // 读取上次记录的窗口 ID
  const stored = await ext.storage.local.get(KEY_WINDOW_ID);
  const existingId = stored[KEY_WINDOW_ID];

  if (existingId != null) {
    try {
      // 尝试聚焦已有窗口（窗口已关闭则会抛出异常）
      await ext.windows.update(existingId, { focused: true });
      return;
    } catch {
      // 窗口已被用户关闭，清除旧 ID，继续创建新窗口
      await ext.storage.local.remove(KEY_WINDOW_ID);
    }
  }

  // 读取上次保存的窗口位置和尺寸
  const boundsData = await ext.storage.local.get(KEY_BOUNDS);
  const bounds = boundsData[KEY_BOUNDS] || {};
  const { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, left, top } = bounds;

  // 构建窗口创建参数
  const createOptions = {
    url:    ext.runtime.getURL('popup/popup.html'),
    type:   'popup',   // 无地址栏、无标签栏的独立窗口
    width:  Math.max(width,  DEFAULT_WIDTH),
    height: Math.max(height, DEFAULT_HEIGHT),
  };

  // 仅在有历史位置时才指定坐标（避免首次打开时出现在屏幕外）
  if (left != null) createOptions.left = left;
  if (top  != null) createOptions.top  = top;

  // 创建独立弹窗并保存窗口 ID
  const win = await ext.windows.create(createOptions);
  await ext.storage.local.set({ [KEY_WINDOW_ID]: win.id });
}

// ── 事件监听 ──────────────────────────────────────────────

// 点击扩展图标 → 打开或聚焦独立窗口
actionAPI.onClicked.addListener(openOrFocusWindow);

// 窗口关闭时清除记录的 ID，以便下次可以正常创建新窗口
ext.windows.onRemoved.addListener(async (windowId) => {
  const stored = await ext.storage.local.get(KEY_WINDOW_ID);
  if (windowId === stored[KEY_WINDOW_ID]) {
    await ext.storage.local.remove(KEY_WINDOW_ID);
  }
});

// 窗口移动或缩放时保存最新的位置和尺寸（下次打开时恢复）
// onBoundsChanged 在 Chrome 86+ / Firefox 62+ 可用
if (ext.windows.onBoundsChanged) {
  ext.windows.onBoundsChanged.addListener(async (win) => {
    const stored = await ext.storage.local.get(KEY_WINDOW_ID);
    if (win.id !== stored[KEY_WINDOW_ID]) return;

    await ext.storage.local.set({
      [KEY_BOUNDS]: {
        width:  win.width,
        height: win.height,
        left:   win.left,
        top:    win.top,
      }
    });
  });
}
