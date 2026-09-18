import { ORIGIN, buildFormBody, detectHtmlError, normalizeText, requestJson, requestText } from './http';

const ENDPOINT = `${ORIGIN}/base-business/pinpad/bindConfigManage.do`;
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };

export interface DeviceBindConfig {
  sn: string;
  perDayBindTimes: string;
  perMonthBindTimes: string;
  whiteList: '1' | '0';
}

export interface DeviceBindConfigRecord {
  id: string;
  maxBindMchCount: string;
  maxBindCount: string;
}

function parsePage(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((element) => element.remove());
  const error = detectHtmlError(doc.documentElement.outerHTML);
  if (error) throw new Error(error);
  return doc;
}

export function parseDeviceBindConfig(html: string, sn: string): DeviceBindConfigRecord | null {
  const doc = parsePage(html);
  const table = Array.from(doc.querySelectorAll('table')).find((element) => {
    const headers = Array.from(element.querySelectorAll('th')).map((th) => normalizeText(th.textContent));
    return headers.includes('配置维度') && headers.includes('维度标识') && headers.includes('累计最大绑定次数');
  });
  if (!table) throw new Error('无法识别设备换绑配置查询结果，未提交修改或新增');
  const headers = Array.from(table.querySelectorAll('th')).map((th) => normalizeText(th.textContent));
  const matches: DeviceBindConfigRecord[] = [];
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(row.children).filter((cell) => cell.tagName === 'TD');
    const value = (name: string) => normalizeText(cells[headers.indexOf(name)]?.textContent);
    if (value('配置维度') !== '乐刷SN' || value('维度标识') !== sn) continue;
    const id = Array.from(row.querySelectorAll('[onclick]')).map((element) =>
      element.getAttribute('onclick')?.match(/\btoEdit\(['"](\d+)['"]\)/)?.[1],
    ).find(Boolean);
    if (!id) throw new Error('查询到配置但缺少可修改的记录 ID，请检查权限');
    matches.push({ id, maxBindMchCount: value('累计最大商户数'), maxBindCount: value('累计最大绑定次数') });
  }
  const pagination = normalizeText(doc.querySelector('.page')?.textContent);
  const pages = pagination.match(/共\s*(\d+)\s*页/);
  if (pages && Number(pages[1]) > 1) throw new Error('查询结果存在多页，无法安全确定唯一配置，请在后台核实');
  if (matches.length > 1) throw new Error('同一 SN 存在多条配置，请在后台核实后再试');
  return matches[0] || null;
}

export async function queryDeviceBindConfig(sn: string): Promise<DeviceBindConfigRecord | null> {
  const html = await requestText(`${ENDPOINT}?method=configList`, {
    method: 'POST', headers: FORM_HEADERS, timeoutMs: 30000,
    body: buildFormBody({ updateTimeRange: '', configType: '1', configValue: sn, operator: '', agentClass: '', subAgentClass: '', pageSize: 200 }),
  });
  return parseDeviceBindConfig(html, sn);
}

export async function createDeviceBindConfig(values: DeviceBindConfig): Promise<void> {
  const response = await requestJson<{ code?: number; msg?: string; success?: boolean }>(`${ENDPOINT}?method=config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, timeoutMs: 30000,
    body: JSON.stringify({ configType: '1', agentClass: '', agentSn: values.sn, maxBindMchCount: '', perDayBindTimes: values.perDayBindTimes, perMonthBindTimes: values.perMonthBindTimes, maxBindCount: '', whiteList: values.whiteList }),
  });
  if (response?.success !== true) throw new Error(response?.msg || '后台未确认设备换绑配置新增成功');
}

export function assertDeviceBindConfigUpdated(html: string): void {
  const doc = parsePage(html);
  const message = normalizeText(doc.body.textContent);
  if (/失败|错误|异常|无权限/.test(message) || !/操作成功\s*[!！]?/.test(message)) {
    throw new Error(message.slice(0, 260) || '后台未确认设备换绑配置修改成功');
  }
}

export async function updateDeviceBindConfig(record: DeviceBindConfigRecord, values: DeviceBindConfig): Promise<void> {
  const html = await requestText(`${ENDPOINT}?method=update`, {
    method: 'POST', headers: FORM_HEADERS, timeoutMs: 30000,
    referrer: `${ENDPOINT}?method=update&id=${record.id}`,
    body: buildFormBody({ id: record.id, maxBindMchCount: record.maxBindMchCount, perDayBindTimes: values.perDayBindTimes, perMonthBindTimes: values.perMonthBindTimes, maxBindCount: record.maxBindCount, whiteList: values.whiteList }),
  });
  assertDeviceBindConfigUpdated(html);
}
