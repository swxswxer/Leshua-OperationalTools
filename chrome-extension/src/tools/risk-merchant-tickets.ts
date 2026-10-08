import { queryRiskTickets, queryRiskHandlingLink, type RiskCardType, type RiskTicket, type RiskHandlingLink } from '../api/risk-merchant-tickets';
import { queryTickets } from '../api/ticket-review';

export type RiskTicketWithLink = RiskTicket & { handling?: RiskHandlingLink; linkError?: string };

export async function loadRiskHandlingLinks(rows: RiskTicket[]): Promise<RiskTicketWithLink[]> {
  const results: RiskTicketWithLink[] = [];
  for (let start = 0; start < rows.length; start += 3) {
    const batch = await Promise.all(rows.slice(start, start + 3).map(async row => {
      try { return { ...row, handling: await queryRiskHandlingLink(row.ticketNumber, row.merchantId) }; }
      catch (error) { return { ...row, linkError: error instanceof Error ? error.message : '处理链接获取失败' }; }
    }));
    results.push(...batch);
  }
  return results;
}

export function searchRiskMerchantTickets(type: string, number: string, page = 1) {
  if (!['1', '2', '3', 'merchant'].includes(type)) throw new Error('请选择身份证、营业执照、银行卡号或商户号');
  const value = number.trim();
  if (!value) throw new Error('请输入查询号码');
  if (!/^[a-zA-Z0-9]+$/.test(value)) throw new Error('查询号码只能包含数字或英文字母');
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('查询页码不正确');
  if (type === 'merchant') {
    if (!/^\d{10}$/.test(value)) throw new Error('请输入10位数字乐刷商户号');
    return queryTickets('merchant', value, page).then(result => ({
      rows: result.rows.map((row): RiskTicket => ({
        merchantId: row.merchantId, ticketNumber: row.ticketNumber, node: row.node,
        status: row.state, created: '', cardType: '', maskedNumber: '', operator: '',
      })),
      page, pages: null, total: null, more: result.more,
    }));
  }
  return queryRiskTickets(type as RiskCardType, value, page).then(result => ({ ...result, more: result.page < result.pages }));
}
