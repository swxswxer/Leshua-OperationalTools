import {
  SELECTION_RESET_TTL_MS, TAKE_SELECTION_RESET, selectionResetStorageKey,
  type SelectionResetCommand, type SelectionResetResponse,
} from '../selection-reset';

const MENU_ROOT = 'operations:selection-reset';
const RESET_ACTIONS = [
  { id: 'operations:reset:syt:WECHAT', title: '收银通 · 重置微信', businessLine: 'syt', reportType: 'WECHAT' },
  { id: 'operations:reset:syt:ALIPAY', title: '收银通 · 重置支付宝', businessLine: 'syt', reportType: 'ALIPAY' },
  { id: 'operations:reset:syt:ALL', title: '收银通 · 重置全部', businessLine: 'syt', reportType: 'ALL' },
  { id: 'operations:reset:lhsd:WECHAT', title: '联合收单 · 重置微信', businessLine: 'lhsd', reportType: 'WECHAT' },
  { id: 'operations:reset:lhsd:ALIPAY', title: '联合收单 · 重置支付宝', businessLine: 'lhsd', reportType: 'ALIPAY' },
  { id: 'operations:reset:lhsd:ALL', title: '联合收单 · 重置全部', businessLine: 'lhsd', reportType: 'ALL' },
] as const;

function createMenu(properties: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

async function installMenus(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
  await createMenu({ id: MENU_ROOT, title: '乐刷运营工具', contexts: ['selection'] });
  for (const action of RESET_ACTIONS) {
    await createMenu({ id: action.id, parentId: MENU_ROOT, title: action.title, contexts: ['selection'] });
  }
}

export function initializeSelectionResetMenu() {
  // Serialize queue changes so simultaneous panel reads cannot claim a command twice.
  let queueOperation: Promise<unknown> = Promise.resolve();
  const withQueue = <T>(action: () => Promise<T>): Promise<T> => {
    const next = queueOperation.then(action);
    queueOperation = next.catch(() => undefined);
    return next;
  };
  const readQueue = async (windowId: number): Promise<SelectionResetCommand[]> => {
    const key = selectionResetStorageKey(windowId);
    const stored = (await chrome.storage.session.get(key))[key];
    if (!Array.isArray(stored)) return [];
    return (stored as SelectionResetCommand[]).filter(command =>
      command.windowId === windowId && Date.now() - command.createdAt < SELECTION_RESET_TTL_MS);
  };

  chrome.runtime.onInstalled.addListener(() => {
    void installMenus().catch(error => console.error('无法创建运营工具右键菜单', error));
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const action = RESET_ACTIONS.find(item => item.id === info.menuItemId);
    if (!action || !info.selectionText?.trim() || tab?.windowId == null || tab.windowId < 0) return;
    const command: SelectionResetCommand = {
      id: crypto.randomUUID(), windowId: tab.windowId, selectionText: info.selectionText,
      businessLine: action.businessLine, reportType: action.reportType, createdAt: Date.now(),
    };
    // Open immediately within the context-menu user gesture, before any storage awaits.
    void chrome.sidePanel.open({ windowId: command.windowId }).then(() => withQueue(async () => {
      const queue = await readQueue(command.windowId);
      await chrome.storage.session.set({ [selectionResetStorageKey(command.windowId)]: [...queue, command] });
    })).catch(error => console.error('无法发起右键重置，请重新选择商户号后重试', error));
  });

  return (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: SelectionResetResponse) => void): boolean => {
    const request = message as { type?: string; windowId?: number } | null;
    if (request?.type !== TAKE_SELECTION_RESET) return false;
    if (sender.url !== chrome.runtime.getURL('sidepanel.html') || !Number.isInteger(request.windowId) || request.windowId! < 0) {
      sendResponse({ ok: false, error: '无效的右键重置接收页面' });
      return true;
    }
    const windowId = request.windowId!;
    void withQueue(async () => {
      const key = selectionResetStorageKey(windowId);
      const queue = await readQueue(windowId);
      const command = queue.shift() || null;
      if (queue.length) await chrome.storage.session.set({ [key]: queue });
      else await chrome.storage.session.remove(key);
      return command;
    }).then(command => sendResponse({ ok: true, command }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  };
}
