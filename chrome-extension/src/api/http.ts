import type {
  BackendMultipartRequest,
  BackendRequestMessage,
  BackendResponseMessage,
  BackendTextRequest,
} from '../types';

export const ORIGIN = 'https://om.leshuazf.com';
export const SAAS = `${ORIGIN}/saasadmin`;
export const SYT_OMS = `${ORIGIN}/syt_oms`;
export const USER_CENTER = `${ORIGIN}/lsuser_center`;

export type FormValue = string | number | boolean | null | undefined;
export type RequestOptions = RequestInit & { accept?: string; timeoutMs?: number };

export function isOperationsBackendPage(): boolean {
  return window.location.origin === ORIGIN;
}

function assertBackendUrl(url: string): string {
  const resolved = new URL(url, ORIGIN);
  if (resolved.origin !== ORIGIN) throw new Error(`禁止请求非运营后台地址: ${resolved.origin}`);
  return resolved.href;
}

async function sendBackendRequest(request: BackendTextRequest | BackendMultipartRequest): Promise<BackendResponseMessage> {
  const message: BackendRequestMessage = { type: 'operations:backend-request', request };
  try {
    const response = await chrome.runtime.sendMessage(message) as BackendResponseMessage | undefined;
    if (!response) throw new Error('扩展后台没有返回请求结果');
    if (!response.ok) throw new Error(response.error || `请求失败 ${response.status}: ${response.text.slice(0, 200)}`);
    return response;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接运营后台: ${messageText}`);
  }
}

function serializeBody(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('当前跨域请求只支持文本或表单参数');
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { output[key] = value; });
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function assertMerchantId(merchantId: string): void {
  if (!/^\d{10}$/.test(merchantId)) throw new Error('乐刷商户号不能为空，且必须为 10 位数字');
}

export function buildFormBody(values: Record<string, FormValue>): URLSearchParams {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => body.set(key, value == null ? '' : String(value)));
  return body;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getDateRange(options: { days?: number; years?: number } = {}): { createStartTime: string; createEndTime: string } {
  const end = new Date();
  const start = new Date(end);
  if (options.years) start.setFullYear(start.getFullYear() - options.years);
  else start.setDate(start.getDate() - (options.days ?? 1));
  return { createStartTime: formatDateTime(start), createEndTime: formatDateTime(end) };
}

export function getAroundDateRange(beforeDays = 1, afterDays = 1): { createStartTime: string; createEndTime: string } {
  const start = new Date();
  const end = new Date();
  start.setDate(start.getDate() - beforeDays);
  end.setDate(end.getDate() + afterDays);
  return { createStartTime: formatDateTime(start), createEndTime: formatDateTime(end) };
}

export function getHtmlMessage(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return normalizeText(document.body?.textContent || html);
}

export function summarizeHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const title = normalizeText(document.querySelector('title')?.textContent);
  const body = normalizeText(document.body?.textContent || html);
  return [title ? `标题: ${title}` : '', body ? `正文: ${body.slice(0, 260)}` : ''].filter(Boolean).join('；') || html.slice(0, 260);
}

export function detectHtmlError(html: string): string {
  const message = getHtmlMessage(html);
  if (message.includes('没有该项操作权限')) return '没有该项操作权限，请确认当前账号已开通该后台操作权限';
  if (/登录|login|验证码/.test(message)) return '当前登录态可能已失效，请重新登录运营后台后再试';
  return '';
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
}

export async function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  const { accept, timeoutMs, headers, ...requestOptions } = options;
  const resolvedUrl = assertBackendUrl(url);
  const requestHeaders = {
    Accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    ...headersToRecord(headers),
  };
  if (!isOperationsBackendPage()) {
    const response = await sendBackendRequest({
      kind: 'text',
      url: resolvedUrl,
      method: requestOptions.method || 'GET',
      headers: requestHeaders,
      body: serializeBody(requestOptions.body),
      cache: requestOptions.cache,
      timeoutMs,
    });
    return response.text;
  }
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetch(resolvedUrl, {
      credentials: 'include',
      redirect: 'follow',
      ...requestOptions,
      signal: controller?.signal ?? requestOptions.signal,
      headers: requestHeaders,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`请求失败 ${response.status}: ${text.slice(0, 200)}`);
    return text;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`请求超时（${timeoutMs}ms）`);
    throw error;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

export async function requestMultipartText(
  url: string,
  fields: Record<string, string>,
  fileField: string,
  file: File,
  timeoutMs = 30000,
): Promise<string> {
  const response = await sendBackendRequest({
    kind: 'multipart',
    url: assertBackendUrl(url),
    fields,
    fileField,
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    fileBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    timeoutMs,
  });
  return response.text;
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const text = await requestText(url, {
    ...options,
    accept: 'application/json, text/javascript, */*; q=0.01',
    headers: { 'Content-Type': 'text/json,charset=utf-8', ...options.headers },
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    const htmlError = looksLikeHtml(text) ? detectHtmlError(text) : '';
    if (htmlError) throw new Error(htmlError);
    throw new Error(`接口返回非 JSON 内容: ${looksLikeHtml(text) ? summarizeHtml(text) : text.slice(0, 260)}`);
  }
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
