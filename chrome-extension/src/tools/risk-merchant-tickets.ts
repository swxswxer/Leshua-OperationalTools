import { queryRiskTickets, type RiskCardType } from '../api/risk-merchant-tickets';

export function searchRiskMerchantTickets(type: string, number: string, page = 1) {
  if (!['1', '2', '3'].includes(type)) throw new Error('请选择身份证、营业执照或银行卡号');
  const value = number.trim();
  if (!value) throw new Error('请输入查询号码');
  if (!/^[a-zA-Z0-9]+$/.test(value)) throw new Error('查询号码只能包含数字或英文字母');
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('查询页码不正确');
  return queryRiskTickets(type as RiskCardType, value, page);
}
