import { beforeEach, expect, it, vi } from 'vitest';
import { searchRiskMerchantTickets } from '../src/tools/risk-merchant-tickets';
import { queryRiskTickets } from '../src/api/risk-merchant-tickets';
vi.mock('../src/api/risk-merchant-tickets', () => ({ queryRiskTickets: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it.each(['1','3','2'])('正确传递查询类型 %s 和页码，保留前导零', async type => {
  await searchRiskMerchantTickets(type, ' 001234567890 ', 2);
  expect(queryRiskTickets).toHaveBeenCalledWith(type, '001234567890', 2);
});
it('支持证件号码中的字母', async () => {
  await searchRiskMerchantTickets('3', '00123ABC');
  expect(queryRiskTickets).toHaveBeenCalledWith('3', '00123ABC', 1);
});
it.each([['', '123', 1], ['4','123',1], ['1',' ',1], ['2','12;34',1], ['2','123',0]])('非法参数不发请求', (type, number, page) => {
  expect(() => searchRiskMerchantTickets(String(type),String(number),Number(page))).toThrow();
  expect(queryRiskTickets).not.toHaveBeenCalled();
});
