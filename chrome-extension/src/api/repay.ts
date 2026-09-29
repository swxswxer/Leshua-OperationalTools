import { ORIGIN, assertMerchantId, buildFormBody, normalizeText, requestText } from './http';

export type Settlement = 'T0' | 'T1';
export interface RepayRow { type: Settlement; billId: string; merchantId: string; date: string; reason: string; selectable: boolean }
export interface RepayPage { rows: RepayRow[]; page: number; pages: number }
const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
const endpoint = (type: Settlement, method: string) => {
  if (type !== 'T0' && type !== 'T1') throw new Error('未知结算方式');
  return `${ORIGIN}/lspos/new${type}Repay.do?method=${method}`;
};
export function repayDateRange(now = new Date()): string {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-01-01 ~ ${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
}
export function repayQueryBody(type: Settlement, merchantId: string, page: number, range: string): URLSearchParams {
  assertMerchantId(merchantId);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('页码不正确');
  const common = { FChannelUin: '', FNetUnionPayStatus: '', FAgentId: '', FMerchantId: merchantId, FBillId: '', FChannelFlowId: '', FUnionPayCode: '', FFailReason: '', FInsureState: '', changeCard: '', applySign: '', abnormalMarkers: '', appointRoute: '', pageSize: 200, pageNumber: page };
  return buildFormBody(type === 'T0' ? { ...common, FRefundFlag: '' } : { ...common, dateRange: range, updateDateRange: '', FPrebillFlag: '', FBankAccountType: '', fRecreateFlag: '', restoreSettleAuth: '' });
}
export function parseRepayPage(html: string, type: Settlement, merchantId: string): RepayPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  const body = normalizeText(doc.body.textContent);
  if (doc.querySelector('input[type="password"]') || /登录|login/i.test(doc.title)) throw new Error('登录已失效，请先登录运营后台');
  if (/没有该项操作权限|权限不足|无权访问/.test(body)) throw new Error('当前账号没有查询权限');
  const required = ['结算日期', '商户号', '打款单号', '失败原因'];
  const table = Array.from(doc.querySelectorAll('table')).find(table => {
    const names = Array.from(table.querySelectorAll('th')).map(th => normalizeText(th.textContent));
    return required.every(name => names.includes(name));
  });
  if (!table) throw new Error('未识别到重出打款单列表，请到后台核对');
  const names = Array.from(table.querySelectorAll('th')).map(th => normalizeText(th.textContent));
  const rows: RepayRow[] = [];
  table.querySelectorAll('tbody > tr').forEach(tr => {
    const cells = Array.from(tr.children);
    if (cells.length !== names.length) return;
    const get = (name: string) => normalizeText(cells[names.indexOf(name)]?.textContent);
    const billId = get('打款单号');
    if (!billId) return;
    if (get('商户号') !== merchantId) throw new Error('后台返回了其他商户的记录，已停止处理');
    const checkbox = tr.querySelector<HTMLInputElement>('input[name="select_item"]');
    const selectable = !!checkbox && !checkbox.disabled && checkbox.value.split('_')[0] === billId && /^\d+$/.test(billId);
    rows.push({ type, billId, merchantId, date: get('结算日期'), reason: get('失败原因'), selectable });
  });
  const pagination = body.match(/第\s*(\d+)\s*页[，,]?\s*共\s*(\d+)\s*页/);
  if (!pagination) throw new Error('无法确认打款单分页信息，请到后台核对');
  return { rows, page: Number(pagination[1]), pages: Number(pagination[2]) };
}
export async function queryRepayPage(type: Settlement, merchantId: string, page: number, range: string): Promise<RepayPage> {
  return parseRepayPage(await requestText(endpoint(type, type === 'T0' ? 't0RepayList' : 't1RepayList'), { method: 'POST', headers, body: repayQueryBody(type, merchantId, page, range) }), type, merchantId);
}
export function parseRepayResponse(text: string): { accepted: boolean; message: string } {
  let data: unknown;
  try { data = JSON.parse(text); if (typeof data === 'string') data = JSON.parse(data); }
  catch { throw new Error('后台返回非预期响应，申请结果待确认，请先到后台核对'); }
  if (!data || typeof data !== 'object' || !('code' in data)) throw new Error('后台未返回结果码，申请结果待确认');
  const result = data as { code: unknown; msg?: unknown };
  return { accepted: result.code === '0000', message: typeof result.msg === 'string' ? result.msg : '后台未提供原因' };
}
export async function applyRepay(type: Settlement, billIds: string[]) {
  if (!billIds.length || billIds.some(id => !/^\d+$/.test(id)) || new Set(billIds).size !== billIds.length) throw new Error('打款单号为空、重复或格式不正确');
  return parseRepayResponse(await requestText(endpoint(type, 'applyAutoRepay'), { method: 'POST', headers, body: buildFormBody({ ids: billIds.join(',') }) }));
}
