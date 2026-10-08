import { beforeEach, expect, it, vi } from 'vitest';
import { searchRiskMerchantTickets, loadRiskHandlingLinks } from '../src/tools/risk-merchant-tickets';
import { queryRiskTickets, queryRiskHandlingLink } from '../src/api/risk-merchant-tickets';
import { queryTickets } from '../src/api/ticket-review';
vi.mock('../src/api/risk-merchant-tickets', () => ({ queryRiskTickets: vi.fn(), queryRiskHandlingLink: vi.fn() }));
vi.mock('../src/api/ticket-review', () => ({ queryTickets: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(queryRiskTickets).mockResolvedValue({ rows: [], page: 1, pages: 1, total: 0 });
});
it('商户号查询复用审核列表并继续获取每条工单的短信信息', async () => {
  vi.mocked(queryTickets).mockResolvedValue({ rows: [
    { merchantId: '0012345678', ticketNumber: 'RC1', merchantName: '测试商户', node: '运营审核', state: '处理中' },
    { merchantId: '0012345678', ticketNumber: 'RC2', merchantName: '测试商户', node: '已完成', state: '完成' },
  ], more: true });
  vi.mocked(queryRiskHandlingLink).mockResolvedValue({ url: 'https://h5.leshuazf.com/', content: '短信内容' });
  const result = await searchRiskMerchantTickets('merchant', ' 0012345678 ', 2);
  expect(queryTickets).toHaveBeenCalledWith('merchant', '0012345678', 2);
  expect(queryRiskTickets).not.toHaveBeenCalled();
  expect(result).toMatchObject({ page: 2, pages: null, total: null, more: true });
  expect(result.rows[0]).toMatchObject({ status: '处理中', node: '运营审核' });
  const linked = await loadRiskHandlingLinks(result.rows);
  expect(queryRiskHandlingLink).toHaveBeenNthCalledWith(1, 'RC1', '0012345678');
  expect(queryRiskHandlingLink).toHaveBeenNthCalledWith(2, 'RC2', '0012345678');
  expect(linked.every(row => row.handling?.content === '短信内容')).toBe(true);
});
it.each(['123', '00123456789', '001234567X', '0012345678;0012345679'])('无效商户号不发送请求: %s', value => {
  expect(() => searchRiskMerchantTickets('merchant', value)).toThrow();
  expect(queryTickets).not.toHaveBeenCalled();
  expect(queryRiskTickets).not.toHaveBeenCalled();
});
it('商户列表为空不查询短信，无后续页', async () => {
  vi.mocked(queryTickets).mockResolvedValue({ rows: [], more: false });
  const result = await searchRiskMerchantTickets('merchant', '0012345678');
  expect(result.more).toBe(false);
  expect(await loadRiskHandlingLinks(result.rows)).toEqual([]);
  expect(queryRiskHandlingLink).not.toHaveBeenCalled();
});
it('商户列表查询失败时保留错误', async () => {
  vi.mocked(queryTickets).mockRejectedValue(new Error('登录已失效'));
  await expect(searchRiskMerchantTickets('merchant', '0012345678')).rejects.toThrow('登录已失效');
  expect(queryRiskHandlingLink).not.toHaveBeenCalled();
});
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
