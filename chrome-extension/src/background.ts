import {
  NATIVE_HOST_NAME,
  type NativeExecuteMessage,
  type NativeResultMessage,
} from './shared/desktop-bridge';

let nativePort: chrome.runtime.Port | undefined;
let reconnectTimer: number | undefined;

function postResult(result: NativeResultMessage): void {
  nativePort?.postMessage(result);
}

async function forwardToOperationsPage(message: NativeExecuteMessage): Promise<NativeResultMessage> {
  const tabs = await chrome.tabs.query({ url: 'https://om.leshuazf.com/*' });
  const tab = tabs.sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
  if (!tab?.id) {
    return {
      type: 'operations-companion.result',
      requestId: message.requestId,
      ok: false,
      message: '未找到已打开的运营后台页面，请先登录 https://om.leshuazf.com/。',
    };
  }

  try {
    const result = await chrome.tabs.sendMessage(tab.id, message) as NativeResultMessage;
    return result || {
      type: 'operations-companion.result',
      requestId: message.requestId,
      ok: false,
      message: '运营后台页面未响应，请刷新页面后重试。',
    };
  } catch (error) {
    return {
      type: 'operations-companion.result',
      requestId: message.requestId,
      ok: false,
      message: `无法与运营后台插件通信：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function connectNativeHost(): void {
  if (nativePort) return;
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort = port;
    port.onMessage.addListener((message: NativeExecuteMessage) => {
      if (message?.type !== 'operations-companion.execute' || !message.requestId) return;
      void forwardToOperationsPage(message).then(postResult);
    });
    port.onDisconnect.addListener(() => {
      nativePort = undefined;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectNativeHost, 2_000) as unknown as number;
    });
  } catch {
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectNativeHost, 2_000) as unknown as number;
  }
}

chrome.runtime.onStartup.addListener(connectNativeHost);
chrome.runtime.onInstalled.addListener(connectNativeHost);
connectNativeHost();
