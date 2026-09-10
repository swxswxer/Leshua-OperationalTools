"use strict";
(() => {
  // src/background/index.ts
  var OPERATIONS_ORIGIN = "https://om.leshuazf.com";
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
    return fetchWithTimeout(request.url, { method: "POST", body: form }, request.timeoutMs);
  }
  function handleRequest(request) {
    return request.kind === "multipart" ? handleMultipartRequest(request) : handleTextRequest(request);
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
