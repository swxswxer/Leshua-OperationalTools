import type {
  BackendMultipartRequest,
  BackendRequest,
  BackendRequestMessage,
  BackendResponseMessage,
  BackendTextRequest,
} from '../types';

const OPERATIONS_ORIGIN = 'https://om.leshuazf.com';

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('无法启用运营工具侧边栏', error));

function assertAllowedUrl(url: string): string {
  const resolved = new URL(url);
  if (resolved.origin !== OPERATIONS_ORIGIN) throw new Error(`不允许代理请求 ${resolved.origin}`);
  return resolved.href;
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000): Promise<BackendResponseMessage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(assertAllowedUrl(url), {
      ...init,
      credentials: 'include',
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, text, error: `请求失败 ${response.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, status: response.status, text };
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? `请求超时（${timeoutMs}ms）`
      : error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, text: '', error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function handleTextRequest(request: BackendTextRequest): Promise<BackendResponseMessage> {
  return fetchWithTimeout(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    cache: request.cache,
  }, request.timeoutMs);
}

function handleMultipartRequest(request: BackendMultipartRequest): Promise<BackendResponseMessage> {
  const form = new FormData();
  Object.entries(request.fields).forEach(([key, value]) => form.append(key, value));
  const buffer = base64ToBuffer(request.fileBase64);
  form.append(request.fileField, new Blob([buffer], { type: request.fileType }), request.fileName);
  return fetchWithTimeout(request.url, { method: 'POST', body: form }, request.timeoutMs);
}

function handleRequest(request: BackendRequest): Promise<BackendResponseMessage> {
  return request.kind === 'multipart' ? handleMultipartRequest(request) : handleTextRequest(request);
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const requestMessage = message as Partial<BackendRequestMessage>;
  if (requestMessage.type !== 'operations:backend-request' || !requestMessage.request) return false;
  void handleRequest(requestMessage.request)
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      status: 0,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    } satisfies BackendResponseMessage));
  return true;
});
