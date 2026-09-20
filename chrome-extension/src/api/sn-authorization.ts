import { ORIGIN, buildFormBody, detectHtmlError, normalizeText, requestMultipartText, requestText } from './http';

const ENDPOINT = `${ORIGIN}/base-business/pinpad/agentWhiteList.do`;
export interface AgentContact { agentId: string; phone: string; receiver: string; email: string }
export interface AuthorizationAgent { id: string; agentId: string; email: string }

function parseHtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach(node => node.remove());
  const error = detectHtmlError(doc.documentElement.outerHTML);
  if (error) throw new Error(error);
  return doc;
}

export function assertAgentApplyResponse(html: string): void {
  const doc = parseHtml(html);
  const text = normalizeText(doc.body.textContent);
  if (/失败|错误|异常/.test(text) || !/操作成功[!！]?/.test(text)) {
    throw new Error(text.slice(0, 240) || '无法确认代理商信息是否提交成功，请到后台核实');
  }
}

export async function applyAuthorizationAgent(values: AgentContact): Promise<void> {
  const html = await requestText(`${ENDPOINT}?method=apply`, {
    method: 'POST', timeoutMs: 30000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildFormBody({ ...values, status: '1', applicantReason: '1' }),
  });
  assertAgentApplyResponse(html);
}

export function parseAuthorizationAgent(html: string, agentId: string): AuthorizationAgent | null {
  const doc = parseHtml(html);
  const table = doc.querySelector('table.tablesorter');
  if (!table) throw new Error('代理记录查询响应格式异常，未发送授权码');
  const headers = Array.from(table.querySelectorAll('thead th')).map(el => normalizeText(el.textContent));
  const required = ['代理商编号', '邮箱', '状态', '操作'];
  if (required.some(name => !headers.includes(name))) throw new Error('代理记录表头不完整，未发送授权码');
  const pageText = normalizeText(doc.querySelector('table.page')?.textContent);
  const pageCount = pageText.match(/共\s*(\d+)\s*页/);
  if (pageCount && Number(pageCount[1]) > 1) throw new Error('代理记录有多页，请在后台确认唯一有效接收记录');
  const matches: AuthorizationAgent[] = [];
  for (const tr of Array.from(table.querySelectorAll('tbody > tr'))) {
    const cells = Array.from(tr.children).filter(el => el.tagName === 'TD');
    const value = (name: string) => normalizeText(cells[headers.indexOf(name)]?.textContent);
    if (value('代理商编号') !== agentId || value('状态') !== '已生效') continue;
    const operation = cells[headers.indexOf('操作')];
    const ids = Array.from(operation?.querySelectorAll('a') || []).map(link => {
      const onclick = link.getAttribute('onclick') || '';
      const path = onclick.match(/['"]([^'"]*agentWhiteList\.do\?method=issueCode[^'"]*)['"]/);
      return path ? new URL(path[1], ENDPOINT).searchParams.get('id') : null;
    }).filter((id): id is string => Boolean(id));
    if (ids.length !== 1 || !/^\d+$/.test(ids[0])) throw new Error('有效代理记录缺少唯一发送 ID');
    const email = value('邮箱');
    if (!/^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/.test(email)) throw new Error('代理记录邮箱为空或已脱敏，请先在后台核实');
    matches.push({ id: ids[0], agentId, email });
  }
  if (matches.length > 1) throw new Error('存在多条已生效代理记录，请在后台确认接收邮箱后再发送');
  return matches[0] || null;
}

export async function queryAuthorizationAgent(agentId: string): Promise<AuthorizationAgent | null> {
  const html = await requestText(`${ENDPOINT}?method=list`, {
    method: 'POST', timeoutMs: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildFormBody({ createTimeRange: '', status: '', applicant: '', phone: '', email: '', receiver: '', agentId, pageSize: 200 }),
  });
  return parseAuthorizationAgent(html, agentId);
}

export function assertAuthorizationIssued(text: string): void {
  let response: { code?: number | string; success?: boolean; msg?: string; message?: string };
  try { response = JSON.parse(text); } catch {
    parseHtml(text);
    throw new Error('发送接口返回非 JSON，状态未知，请先核实邮箱及后台，勿重复发送');
  }
  if (!response || String(response.code) !== '0' || response.success !== true) {
    throw new Error(response?.msg || response?.message || '发送接口未确认成功，请到后台核实');
  }
}

export async function issueAuthorizationCode(file: File, id: string): Promise<void> {
  const response = await requestMultipartText(`${ENDPOINT}?method=issueCode`, { id, reason: '4' }, 'uploadFile', file, 30000,
    { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' });
  assertAuthorizationIssued(response);
}
