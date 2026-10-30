"use strict";
(() => {
  // src/selection-reset.ts
  var TAKE_SELECTION_RESET = "operations:take-selection-reset";
  var SELECTION_RESET_TTL_MS = 6e4;
  function selectionResetStorageKey(windowId) {
    return `operations:selection-reset:${windowId}`;
  }

  // src/background/selection-reset.ts
  var MENU_ROOT = "operations:selection-reset";
  var RESET_ACTIONS = [
    { id: "operations:reset:syt:WECHAT", title: "\u6536\u94F6\u901A \xB7 \u91CD\u7F6E\u5FAE\u4FE1", businessLine: "syt", reportType: "WECHAT" },
    { id: "operations:reset:syt:ALIPAY", title: "\u6536\u94F6\u901A \xB7 \u91CD\u7F6E\u652F\u4ED8\u5B9D", businessLine: "syt", reportType: "ALIPAY" },
    { id: "operations:reset:syt:ALL", title: "\u6536\u94F6\u901A \xB7 \u91CD\u7F6E\u5168\u90E8", businessLine: "syt", reportType: "ALL" },
    { id: "operations:reset:lhsd:WECHAT", title: "\u8054\u5408\u6536\u5355 \xB7 \u91CD\u7F6E\u5FAE\u4FE1", businessLine: "lhsd", reportType: "WECHAT" },
    { id: "operations:reset:lhsd:ALIPAY", title: "\u8054\u5408\u6536\u5355 \xB7 \u91CD\u7F6E\u652F\u4ED8\u5B9D", businessLine: "lhsd", reportType: "ALIPAY" },
    { id: "operations:reset:lhsd:ALL", title: "\u8054\u5408\u6536\u5355 \xB7 \u91CD\u7F6E\u5168\u90E8", businessLine: "lhsd", reportType: "ALL" }
  ];
  function createMenu(properties) {
    return new Promise((resolve, reject) => {
      chrome.contextMenus.create(properties, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  async function installMenus() {
    await new Promise((resolve, reject) => {
      chrome.contextMenus.removeAll(() => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
    await createMenu({ id: MENU_ROOT, title: "\u4E50\u5237\u8FD0\u8425\u5DE5\u5177", contexts: ["selection"] });
    for (const action of RESET_ACTIONS) {
      await createMenu({ id: action.id, parentId: MENU_ROOT, title: action.title, contexts: ["selection"] });
    }
  }
  function initializeSelectionResetMenu() {
    let queueOperation = Promise.resolve();
    const withQueue = (action) => {
      const next = queueOperation.then(action);
      queueOperation = next.catch(() => void 0);
      return next;
    };
    const readQueue = async (windowId) => {
      const key = selectionResetStorageKey(windowId);
      const stored = (await chrome.storage.session.get(key))[key];
      if (!Array.isArray(stored)) return [];
      return stored.filter((command) => command.windowId === windowId && Date.now() - command.createdAt < SELECTION_RESET_TTL_MS);
    };
    chrome.runtime.onInstalled.addListener(() => {
      void installMenus().catch((error) => console.error("\u65E0\u6CD5\u521B\u5EFA\u8FD0\u8425\u5DE5\u5177\u53F3\u952E\u83DC\u5355", error));
    });
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      const action = RESET_ACTIONS.find((item) => item.id === info.menuItemId);
      if (!action || !info.selectionText?.trim() || tab?.windowId == null || tab.windowId < 0) return;
      const command = {
        id: crypto.randomUUID(),
        windowId: tab.windowId,
        selectionText: info.selectionText,
        businessLine: action.businessLine,
        reportType: action.reportType,
        createdAt: Date.now()
      };
      void chrome.sidePanel.open({ windowId: command.windowId }).then(() => withQueue(async () => {
        const queue = await readQueue(command.windowId);
        await chrome.storage.session.set({ [selectionResetStorageKey(command.windowId)]: [...queue, command] });
      })).catch((error) => console.error("\u65E0\u6CD5\u53D1\u8D77\u53F3\u952E\u91CD\u7F6E\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5546\u6237\u53F7\u540E\u91CD\u8BD5", error));
    });
    return (message, sender, sendResponse) => {
      const request = message;
      if (request?.type !== TAKE_SELECTION_RESET) return false;
      if (sender.url !== chrome.runtime.getURL("sidepanel.html") || !Number.isInteger(request.windowId) || request.windowId < 0) {
        sendResponse({ ok: false, error: "\u65E0\u6548\u7684\u53F3\u952E\u91CD\u7F6E\u63A5\u6536\u9875\u9762" });
        return true;
      }
      const windowId = request.windowId;
      void withQueue(async () => {
        const key = selectionResetStorageKey(windowId);
        const queue = await readQueue(windowId);
        const command = queue.shift() || null;
        if (queue.length) await chrome.storage.session.set({ [key]: queue });
        else await chrome.storage.session.remove(key);
        return command;
      }).then((command) => sendResponse({ ok: true, command })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    };
  }

  // src/background/index.ts
  var OPERATIONS_ORIGIN = "https://om.leshuazf.com";
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error("\u65E0\u6CD5\u542F\u7528\u8FD0\u8425\u5DE5\u5177\u4FA7\u8FB9\u680F", error));
  function assertAllowedUrl(url) {
    const resolved = new URL(url);
    if (resolved.origin !== OPERATIONS_ORIGIN) throw new Error(`\u4E0D\u5141\u8BB8\u4EE3\u7406\u8BF7\u6C42 ${resolved.origin}`);
    return resolved.href;
  }
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return buffer;
  }
  async function fetchWithTimeout(url, init, timeoutMs = 3e4) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(assertAllowedUrl(url), {
        ...init,
        credentials: "include",
        redirect: "follow",
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, status: response.status, text, error: `\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true, status: response.status, text };
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError" ? `\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09` : error instanceof Error ? error.message : String(error);
      return { ok: false, status: 0, text: "", error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
  function handleTextRequest(request) {
    return fetchWithTimeout(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? void 0 : request.body,
      cache: request.cache
    }, request.timeoutMs);
  }
  function handleMultipartRequest(request) {
    const form = new FormData();
    Object.entries(request.fields).forEach(([key, value]) => form.append(key, value));
    const buffer = base64ToBuffer(request.fileBase64);
    form.append(request.fileField, new Blob([buffer], { type: request.fileType }), request.fileName);
    const headers = new Headers(request.headers);
    headers.delete("Content-Type");
    return fetchWithTimeout(request.url, { method: "POST", body: form, headers }, request.timeoutMs);
  }
  function handleRequest(request) {
    return request.kind === "multipart" ? handleMultipartRequest(request) : handleTextRequest(request);
  }
  var handleSelectionResetMessage = initializeSelectionResetMenu();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (handleSelectionResetMessage(message, sender, sendResponse)) return true;
    const requestMessage = message;
    if (requestMessage.type !== "operations:backend-request" || !requestMessage.request) return false;
    void handleRequest(requestMessage.request).then(sendResponse).catch((error) => sendResponse({
      ok: false,
      status: 0,
      text: "",
      error: error instanceof Error ? error.message : String(error)
    }));
    return true;
  });
})();
