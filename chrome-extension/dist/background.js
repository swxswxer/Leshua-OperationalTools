"use strict";
(() => {
  // src/shared/desktop-bridge.ts
  var NATIVE_HOST_NAME = "com.leshuazf.operations_companion";

  // src/background.ts
  var nativePort;
  var reconnectTimer;
  function postResult(result) {
    nativePort?.postMessage(result);
  }
  async function forwardToOperationsPage(message) {
    const tabs = await chrome.tabs.query({ url: "https://om.leshuazf.com/*" });
    const tab = tabs.sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    if (!tab?.id) {
      return {
        type: "operations-companion.result",
        requestId: message.requestId,
        ok: false,
        message: "\u672A\u627E\u5230\u5DF2\u6253\u5F00\u7684\u8FD0\u8425\u540E\u53F0\u9875\u9762\uFF0C\u8BF7\u5148\u767B\u5F55 https://om.leshuazf.com/\u3002"
      };
    }
    try {
      const result = await chrome.tabs.sendMessage(tab.id, message);
      return result || {
        type: "operations-companion.result",
        requestId: message.requestId,
        ok: false,
        message: "\u8FD0\u8425\u540E\u53F0\u9875\u9762\u672A\u54CD\u5E94\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5\u3002"
      };
    } catch (error) {
      return {
        type: "operations-companion.result",
        requestId: message.requestId,
        ok: false,
        message: `\u65E0\u6CD5\u4E0E\u8FD0\u8425\u540E\u53F0\u63D2\u4EF6\u901A\u4FE1\uFF1A${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  function connectNativeHost() {
    if (nativePort) return;
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      nativePort = port;
      port.onMessage.addListener((message) => {
        if (message?.type !== "operations-companion.execute" || !message.requestId) return;
        void forwardToOperationsPage(message).then(postResult);
      });
      port.onDisconnect.addListener(() => {
        nativePort = void 0;
        if (reconnectTimer !== void 0) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectNativeHost, 2e3);
      });
    } catch {
      if (reconnectTimer !== void 0) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectNativeHost, 2e3);
    }
  }
  chrome.runtime.onStartup.addListener(connectNativeHost);
  chrome.runtime.onInstalled.addListener(connectNativeHost);
  connectNativeHost();
})();
