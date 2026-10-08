import { ORIGIN, buildFormBody, requestJson, requestText, normalizeText } from './http';

const BASE = `${ORIGIN}/lspos/`;
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
export const REVIEW_FORM = 'riskchecks_operation_manager_check';
export interface TicketRow { ticketNumber: string; merchantId: string; merchantName: string; state: string; node: string }
export interface TicketTask { ticketNumber: string; formKey: string; flowTaskId: string; upcomingProcessId: string }
export interface AppealInfo { riskSource: number | string; appealType: number | string | null; mtlVerifyStatus: number | string; merchantAuthenticity: number | string; merchantTxnType: number | string }
export interface ReviewChoice { value: string; label: string }
export interface ReviewField { name: string; label: string; choices: ReviewChoice[] }

function htmlDocument(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach(node => node.remove());
  if (doc.querySelector('input[type="password"]') || /登录|login/i.test(doc.title)) throw new Error('登录已失效，请先登录运营后台');
  if (/没有该项操作权限|无权访问|权限不足/.test(doc.body.textContent || '')) throw new Error('当前账号没有工单审核权限');
  return doc;
}

export function parseTicketRows(html: string): { rows: TicketRow[]; more: boolean } {
  const doc = htmlDocument(html);
  const table = Array.from(doc.querySelectorAll('table')).find(table => Array.from(table.querySelectorAll('th')).some(th => th.textContent?.trim() === '当前处理节点'));
  if (!table) throw new Error('工单查询返回了未知页面，无法确认查询结果');
  const headers = Array.from(table.querySelectorAll('th')).map(th => normalizeText(th.textContent));
  const rows: TicketRow[] = [];
  table.querySelectorAll('tbody > tr').forEach(tr => {
    const cells = Array.from(tr.children);
    const get = (name: string) => normalizeText(cells[headers.indexOf(name)]?.textContent);
    const ticketNumber = get('工单号');
    if (!/^RC\d+$/.test(ticketNumber)) return;
    rows.push({ ticketNumber, merchantId: get('商户编号'), merchantName: get('商户名称'), state: get('处理状态'), node: get('当前处理节点') });
  });
  const pages = normalizeText(doc.body.textContent).match(/第\s*(\d+)\s*页[，,]?\s*共\s*(\d+)\s*页/);
  return { rows, more: !!pages && Number(pages[1]) < Number(pages[2]) };
}

export async function queryTickets(kind: 'merchant' | 'ticket', value: string, page = 1) {
  const html = await requestText(`${BASE}riskchecks.do?method=retrieveRiskChecksTicketList`, {
    headers: FORM_HEADERS,
    method: 'POST', body: buildFormBody({ dateRange: '', ticketNumber: kind === 'ticket' ? value : '', merchantId: kind === 'merchant' ? value : '', primaryAgentId: '', primaryAgentIdXieji: '', riskSource: '', riskType: '', merchantTxnType: -1, agentClass: -1, agentSubClass: '', manualAppealResult: '', appealReplyTimeRange: '', upcomingProcessName: -1, ticketStatus: '', agentRiskLevel: -1, riskVerifyType: -1, certifNo: '', pageSize: 20, pageNumber: page }),
  });
  const result = parseTicketRows(html);
  if (result.rows.some(row => kind === 'merchant' ? row.merchantId !== value : row.ticketNumber !== value)) throw new Error('后台返回了不匹配的工单，请到后台核对查询条件');
  return result;
}

export function parseTask(html: string, ticketNumber: string): TicketTask {
  const doc = htmlDocument(html);
  const tasks: TicketTask[] = [];
  for (const link of Array.from(doc.querySelectorAll<HTMLElement>('a[onclick]'))) {
    const match = (link.getAttribute('onclick') || '').match(/^\s*checkTicket\('([^']*)','([^']*)','(\d+)','(\d+)','([^']*)'\);?\s*$/);
    if (!match || match[1] !== ticketNumber || match[2] !== REVIEW_FORM || match[5] !== '运营审核' || link.style.display === 'none') continue;
    tasks.push({ ticketNumber, formKey: match[2], flowTaskId: match[3], upcomingProcessId: match[4] });
  }
  if (tasks.length !== 1) throw new Error('未找到唯一的运营审核任务，可能已流转、被占用或没有审核权限');
  return tasks[0];
}

export async function queryTask(ticketNumber: string): Promise<TicketTask> {
  return parseTask(await requestText(`${BASE}ticketmanagement.do?method=retrieveTicketCommonVerifyList`, {
    headers: FORM_HEADERS,
    method: 'POST', body: buildFormBody({ ticketNumber, prodefid: 'ticket_risk_management_risk_checks', upcomingVerify: 0, riskChecksJoinTableFlag: 1, pageSize: 200 }),
  }), ticketNumber);
}

function reviewFieldLabel(control: Element): string {
  const cell = control.closest('td');
  if (cell?.previousElementSibling) return normalizeText(cell.previousElementSibling.textContent);
  const labels = Array.from((control as HTMLInputElement).labels || []).map(label => normalizeText(label.textContent)).filter(Boolean);
  if (labels.length) return labels.join(' / ');
  return normalizeText(control.parentElement?.textContent);
}

function choiceLabel(control: HTMLInputElement): string {
  const labels = Array.from(control.labels || []).map(label => normalizeText(label.textContent)).filter(Boolean);
  if (labels.length) return labels.join(' / ');
  const text = normalizeText(control.parentElement?.textContent);
  const prompt = reviewFieldLabel(control);
  return text.replace(prompt, '').trim() || control.value;
}

export function verifyReviewPage(html: string, task: TicketTask): ReviewField[] {
  const doc = htmlDocument(html);
  const form = doc.querySelector('form[action="riskchecks.do?method=verifyRiskChecksTicket"]');
  if (!form) throw new Error('无法进入审核页面，可能被其他人占用，请到后台确认');
  for (const [key, value] of Object.entries(task)) {
    if (form.querySelector<HTMLInputElement>(`input[name="${key}"]`)?.value !== value) throw new Error('审核任务参数不一致，请重新查询');
  }
  if (!form.querySelector('input[name="materialCheckResult"][value="1"]')) throw new Error('当前工单不支持资料审核通过');
  const fields = new Map<string, ReviewField>();
  form.querySelectorAll<HTMLSelectElement>('select[name]').forEach(select => {
    const label = reviewFieldLabel(select);
    if (!/微信|支付宝/.test(label) || !/申诉/.test(label)) return;
    const choices = Array.from(select.options).filter(option => option.value.trim()).map(option => ({ value: option.value, label: normalizeText(option.textContent) }));
    if (choices.length) fields.set(select.name, { name: select.name, label, choices });
  });
  const radios = new Map<string, HTMLInputElement[]>();
  form.querySelectorAll<HTMLInputElement>('input[type="radio"][name]').forEach(input => {
    const group = radios.get(input.name) || []; group.push(input); radios.set(input.name, group);
  });
  for (const [name, inputs] of radios) {
    const label = inputs.map(reviewFieldLabel).find(text => /微信|支付宝/.test(text) && /申诉/.test(text));
    if (!label) continue;
    const choices = inputs.map(input => ({ value: input.value, label: choiceLabel(input) }));
    if (choices.length) fields.set(name, { name, label, choices });
  }
  return Array.from(fields.values());
}

export async function openReview(task: TicketTask): Promise<ReviewField[]> {
  const params = buildFormBody({ method: 'retrieveTicketVerificationPage', ...task });
  return verifyReviewPage(await requestText(`${BASE}ticketmanagement.do?${params}`), task);
}
export function getAppealInfo(ticketNumber: string): Promise<AppealInfo> {
  return requestJson(`${BASE}riskchecks.do?method=retrieveMrtAppealDetailAndMtlType&${buildFormBody({ ticketNumber })}`);
}
export async function releaseReview(task: TicketTask): Promise<void> {
  const text = await requestText(`${BASE}ticketmanagement.do?method=dropTicketVerificationPageLock`, { method: 'POST', headers: FORM_HEADERS, body: buildFormBody({ ...task }) });
  if (/^\s*</.test(text)) { htmlDocument(text); throw new Error('释放审核锁返回未知页面，请到后台确认'); }
  if (/"(?:success|ok)"\s*:\s*false/.test(text)) throw new Error('后台未确认释放审核锁，请到后台确认');
}
export function assertReviewSuccess(html: string): void {
  const doc = htmlDocument(html);
  const success = !!doc.querySelector('img[src$="/success.gif"]') && Array.from(doc.querySelectorAll('span')).some(span => /^操作成功[!！]?$/.test(normalizeText(span.textContent)));
  if (!success) throw new Error(`后台未确认审核成功：${normalizeText(doc.body.textContent).slice(0, 180) || '空响应'}`);
}
export async function submitReview(task: TicketTask, info: AppealInfo, remark: string, choices: Record<string, string> = {}): Promise<void> {
  const html = await requestText(`${BASE}riskchecks.do?method=verifyRiskChecksTicket`, {
    headers: FORM_HEADERS,
    method: 'POST', body: buildFormBody({ ...task, materialCheckResult: 1, appealResultName: '', appealFailureReason: '', attachments: '', unpassReason: '', remark, appealType: '', appealResult: '', nonCompliantType: '', merchantAuthenticity: info.merchantAuthenticity, merchantTxnType: info.merchantTxnType, ...choices }),
  });
  assertReviewSuccess(html);
}
