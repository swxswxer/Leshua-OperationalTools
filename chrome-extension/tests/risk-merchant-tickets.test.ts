import { beforeEach, expect, it, vi } from 'vitest';
import { searchRiskMerchantTickets, loadRiskHandlingLinks } from '../src/tools/risk-merchant-tickets';
import { queryRiskTickets, queryRiskHandlingLink } from '../src/api/risk-merchant-tickets';
vi.mock('../src/api/risk-merchant-tickets', () => ({ queryRiskTickets: vi.fn(), queryRiskHandlingLink: vi.fn() }));
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
it('空查询不获取链接', async () => {
  expect(await loadRiskHandlingLinks([])).toEqual([]);
  expect(queryRiskHandlingLink).not.toHaveBeenCalled();
});
it('逐工单获取链接，单条失败不影响其他记录，顺序不变', async () => {
  const base = { created: '', cardType: '身份证', maskedNumber: '***', merchantId: '0012345678', node: '', status: '', operator: '' };
  vi.mocked(queryRiskHandlingLink).mockResolvedValueOnce({ url: 'https://h5.leshuazf.com/', content: '通知' }).mockRejectedValueOnce(new Error('权限不足'));
  const result = await loadRiskHandlingLinks([{ ...base, ticketNumber: 'RC1' }, { ...base, ticketNumber: 'RC2' }]);
  expect(queryRiskHandlingLink).toHaveBeenNthCalledWith(1, 'RC1', '0012345678');
  expect(queryRiskHandlingLink).toHaveBeenNthCalledWith(2, 'RC2', '0012345678');
  expect(result[0].handling?.content).toBe('通知');
  expect(result[1].linkError).toBe('权限不足');
});
