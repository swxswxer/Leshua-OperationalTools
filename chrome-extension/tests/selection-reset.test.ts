import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeSelectionResetMenu } from '../src/background/selection-reset';
import { createSelectionResetHandler, initializeSelectionResetReceiver } from '../src/sidepanel/selection-reset';
import { SELECTION_RESET_TTL_MS, TAKE_SELECTION_RESET, selectionResetStorageKey, type SelectionResetCommand, type SelectionResetResponse } from '../src/selection-reset';
import { parseMerchantIds } from '../src/api/quick-report';

type StorageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
let installed: () => void;
let clicked: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void;
let bridge: ReturnType<typeof initializeSelectionResetMenu>;
let stored: Map<string, unknown>;
let storageListeners: Set<StorageListener>;
let cleanups: (() => void)[];

function click(menuItemId = 'operations:reset:syt:ALL', windowId = 10, selectionText = '0034567890;2345678901') {
  clicked({ menuItemId, selectionText } as chrome.contextMenus.OnClickData, { windowId } as chrome.tabs.Tab);
}

function take(windowId = 10, url = 'chrome-extension://test/sidepanel.html'): Promise<SelectionResetResponse> {
  return new Promise(resolve => {
    expect(bridge({ type: TAKE_SELECTION_RESET, windowId }, { url }, resolve)).toBe(true);
  });
}

function command(): SelectionResetCommand {
  return { id: 'test-command', windowId: 10, selectionText: '0034567890', businessLine: 'lhsd', reportType: 'ALIPAY', createdAt: Date.now() };
}

beforeEach(() => {
  stored = new Map();
  storageListeners = new Set();
  cleanups = [];
  const notify = (key: string, oldValue: unknown, newValue?: unknown) => {
    for (const listener of storageListeners) listener({ [key]: { oldValue, newValue } }, 'session');
  };
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onInstalled: { addListener: (handler: () => void) => { installed = handler; } },
      sendMessage: vi.fn((message: unknown) => new Promise<SelectionResetResponse>(resolve => {
        bridge(message, { url: 'chrome-extension://test/sidepanel.html' }, resolve);
      })),
    },
    contextMenus: {
      create: vi.fn((properties: chrome.contextMenus.CreateProperties, done: () => void) => { done(); return properties.id; }),
      removeAll: vi.fn((done: () => void) => done()),
      onClicked: { addListener: (handler: typeof clicked) => { clicked = handler; } },
    },
    sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 10 }) },
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(stored.get(key)) })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) {
            const previous = stored.get(key);
            stored.set(key, structuredClone(value));
            notify(key, previous, structuredClone(value));
          }
        }),
        remove: vi.fn(async (key: string) => {
          const previous = stored.get(key);
          stored.delete(key);
          notify(key, previous);
        }),
      },
      onChanged: {
        addListener: (handler: StorageListener) => storageListeners.add(handler),
        removeListener: (handler: StorageListener) => storageListeners.delete(handler),
      },
    },
  });
  bridge = initializeSelectionResetMenu();
});
afterEach(() => {
  cleanups.forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('网页选中文本右键菜单', () => {
  it('安装时创建一个父菜单和六项操作，仅选中文字时显示且不限定网页域名', async () => {
    installed();
    await vi.waitFor(() => expect(chrome.contextMenus.create).toHaveBeenCalledTimes(7));
    const menus = vi.mocked(chrome.contextMenus.create).mock.calls.map(call => call[0]);
    expect(menus[0]).toMatchObject({ title: '乐刷运营工具', contexts: ['selection'] });
    expect(menus.slice(1).map(menu => menu.title)).toEqual([
      '收银通 · 重置微信', '收银通 · 重置支付宝', '收银通 · 重置全部',
      '联合收单 · 重置微信', '联合收单 · 重置支付宝', '联合收单 · 重置全部',
    ]);
    expect(menus.every(menu => menu.contexts?.[0] === 'selection' && !menu.documentUrlPatterns)).toBe(true);
  });

  it.each([
    ['syt', 'WECHAT'], ['syt', 'ALIPAY'], ['syt', 'ALL'],
    ['lhsd', 'WECHAT'], ['lhsd', 'ALIPAY'], ['lhsd', 'ALL'],
  ])('菜单 %s/%s 正确传递选择文本、业务线和通道，打开侧边栏前不等待存储', async (businessLine, reportType) => {
    click(`operations:reset:${businessLine}:${reportType}`);
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 10 });
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(stored.has(selectionResetStorageKey(10))).toBe(true));
    const response = await take();
    expect(response).toMatchObject({ ok: true, command: { windowId: 10, selectionText: '0034567890;2345678901', businessLine, reportType } });
    expect(await take()).toEqual({ ok: true, command: null });
  });

  it('不同浏览器窗口的请求互不消费，并发领取也只交付一次', async () => {
    click('operations:reset:syt:ALL', 20);
    await vi.waitFor(() => expect(stored.has(selectionResetStorageKey(20))).toBe(true));
    expect(await take(10)).toEqual({ ok: true, command: null });
    const responses = await Promise.all([take(20), take(20)]);
    expect(responses.filter(response => response.ok && response.command)).toHaveLength(1);
  });

  it('后台重启后仍可领取尚未交付的请求', async () => {
    click();
    await vi.waitFor(() => expect(stored.has(selectionResetStorageKey(10))).toBe(true));
    bridge = initializeSelectionResetMenu();
    expect(await take()).toMatchObject({ ok: true, command: { businessLine: 'syt' } });
  });

  it('过期请求与来自非侧边栏页面的领取不会触发重置', async () => {
    const pending = command();
    stored.set(selectionResetStorageKey(10), [pending]);
    expect(await take(10, 'https://example.com')).toMatchObject({ ok: false });
    expect(stored.has(selectionResetStorageKey(10))).toBe(true);
    stored.set(selectionResetStorageKey(10), [{ ...pending, createdAt: Date.now() - SELECTION_RESET_TTL_MS - 1 }]);
    expect(await take()).toEqual({ ok: true, command: null });
  });

  it('打开侧边栏失败时不留下之后会自动执行的请求', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(chrome.sidePanel.open).mockRejectedValue(new Error('无法打开'));
    click();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });
});

describe('侧边栏接收与执行右键请求', () => {
  it('侧边栏首次打开可领取请求，关闭重新打开不会重复执行', async () => {
    click();
    await vi.waitFor(() => expect(stored.has(selectionResetStorageKey(10))).toBe(true));
    const onCommand = vi.fn().mockResolvedValue(undefined);
    const stop = initializeSelectionResetReceiver(onCommand, vi.fn());
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    stop();
    cleanups.push(initializeSelectionResetReceiver(onCommand, vi.fn()));
    await vi.waitFor(() => expect(chrome.windows.getCurrent).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3));
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('已经打开的侧边栏能连续接收后续菜单操作', async () => {
    const onCommand = vi.fn().mockResolvedValue(undefined);
    cleanups.push(initializeSelectionResetReceiver(onCommand, vi.fn()));
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalled());
    click();
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    click('operations:reset:lhsd:WECHAT');
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(2));
    expect(onCommand.mock.calls[1][0]).toMatchObject({ businessLine: 'lhsd', reportType: 'WECHAT' });
  });

  it('其他窗口的侧边栏不会接收当前窗口操作', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    vi.mocked(chrome.windows.getCurrent).mockResolvedValueOnce({ id: 10 } as chrome.windows.Window).mockResolvedValueOnce({ id: 20 } as chrome.windows.Window);
    cleanups.push(initializeSelectionResetReceiver(first, vi.fn()));
    cleanups.push(initializeSelectionResetReceiver(second, vi.fn()));
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2));
    click('operations:reset:lhsd:ALL', 20);
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
  });

  it('先切换页面再填入参数并执行，直接复用现有商户号校验', async () => {
    let text = '';
    const order: string[] = [];
    const submit = vi.fn();
    const handle = createSelectionResetHandler({
      isBusy: () => false,
      showResetView: async () => { order.push('show'); return true; },
      applyCommand: request => { order.push('fill'); text = request.selectionText; },
      runReset: async () => { order.push('run'); submit(parseMerchantIds(text)); },
      onError: vi.fn(),
    });
    await handle(command());
    expect(order).toEqual(['show', 'fill', 'run']);
    expect(submit).toHaveBeenCalledWith(['0034567890']);
    await expect(handle({ ...command(), selectionText: '不是商户号' })).rejects.toThrow('10 位');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('已有任务执行时不会改写输入或重复提交，结束后允许新的菜单操作', async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const apply = vi.fn();
    const run = vi.fn().mockReturnValueOnce(gate).mockResolvedValue(undefined);
    const onError = vi.fn();
    const handle = createSelectionResetHandler({ isBusy: () => false, showResetView: async () => true, applyCommand: apply, runReset: run, onError });
    cleanups.push(initializeSelectionResetReceiver(handle, onError));
    click();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    click('operations:reset:lhsd:ALL');
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('未执行')));
    expect(apply).toHaveBeenCalledTimes(1);
    finish();
    await gate;
    click('operations:reset:lhsd:WECHAT');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('侧边栏其他商户操作正在执行或放弃离开审核页时，不自动提交', async () => {
    const apply = vi.fn();
    const run = vi.fn();
    const onError = vi.fn();
    const busy = createSelectionResetHandler({ isBusy: () => true, showResetView: async () => true, applyCommand: apply, runReset: run, onError });
    await busy(command());
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('未执行'));
    const stay = createSelectionResetHandler({ isBusy: () => false, showResetView: async () => false, applyCommand: apply, runReset: run, onError });
    await stay(command());
    expect(apply).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
