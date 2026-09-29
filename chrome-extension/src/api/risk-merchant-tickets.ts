import { ORIGIN, buildFormBody, normalizeText, requestText } from './http';

export type RiskCardType = '1' | '2' | '3';
export interface RiskTicket { created: string; cardType: string; maskedNumber: string; merchantId: string; ticketNumber: string; node: string; status: string; operator: string }
export interface RiskTicketPage { rows: RiskTicket[]; page: number; pages: number; total: number }

export function parseRiskTickets(html: string): RiskTicketPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  const body = normalizeText(doc.body.textContent);
  if (doc.querySelector('input[type="password"]') || /登录|login/i.test(doc.title)) throw new Error('登录已失效，请先登录运营后台');
  if (/没有该项操作权限|权限不足|无权访问/.test(body)) throw new Error('当前账号没有查询权限');
  const required = ['创建时间', '证件类型', '证件号码', '商户编号', '工单号', '当前处理节点', '名单状态', '操作人'];
  const table = Array.from(doc.querySelectorAll('table')).find(table => {
    const headings = Array.from(table.querySelectorAll('th')).map(th => normalizeText(th.textContent));
    return required.every(name => headings.includes(name));
  });
  if (!table) throw new Error('后台返回未知页面，无法读取风险商户工单');
  const headings = Array.from(table.querySelectorAll('th')).map(th => normalizeText(th.textContent));
  const rows: RiskTicket[] = [];
  table.querySelectorAll('tbody > tr').forEach(tr => {
    const cells = Array.from(tr.children);
    if (cells.length !== headings.length) return;
    const get = (name: string) => normalizeText(cells[headings.indexOf(name)]?.textContent);
    rows.push({ created: get('创建时间'), cardType: get('证件类型'), maskedNumber: get('证件号码'), merchantId: get('商户编号'), ticketNumber: get('工单号'), node: get('当前处理节点'), status: get('名单状态'), operator: get('操作人') });
  });
  const pagination = body.match(/第\s*(\d+)\s*页[，,]?\s*共\s*(\d+)\s*页/);
  const total = body.match(/共\s*(\d+)\s*条记录/);
  return { rows, page: pagination ? Number(pagination[1]) : 1, pages: pagination ? Number(pagination[2]) : 1, total: total ? Number(total[1]) : rows.length };
}

export async function queryRiskTickets(cardType: RiskCardType, cardNumber: string, page: number): Promise<RiskTicketPage> {
  return parseRiskTickets(await requestText(`${ORIGIN}/lspos/merchantCardBlackList.do?method=list`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: buildFormBody({ dateRange: '', cardType, cardNumber, merchantId: '', ticketNumber: '', status: '', upcomingProcessName: '', pageSize: 20, pageNumber: page }),
  }));
}
