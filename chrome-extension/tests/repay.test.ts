import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyRepay, queryRepayPage, repayDateRange, repayQueryBody, parseRepayPage, parseRepayResponse, type RepayRow } from '../src/api/repay';
import { searchRepay, submitSelectedRepay } from '../src/tools/repay';
vi.mock('../src/api/repay', async original => ({ ...await original<typeof import('../src/api/repay')>(), applyRepay: vi.fn(), queryRepayPage: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());
function stubEmptyTable(body: string, hasCheckbox = false) {
  const table = {
    querySelectorAll: (selector: string) => selector === 'th' ? ['结算日期','商户号','打款单号','失败原因'].map(textContent => ({ textContent })) : [],
    querySelector: () => hasCheckbox ? {} : null,
  };
  vi.stubGlobal('DOMParser', class {
    parseFromString() { return { title: '重打款', body: { textContent: body }, querySelector: () => null, querySelectorAll: (selector: string) => selector === 'table' ? [table] : [] }; }
  });
}
it.each(['T0','T1'] as const)('%s 空列表无分页栏是正常空结果', type => {
  stubEmptyTable('暂无数据');
  expect(parseRepayPage('',type,'0012345678')).toEqual({ rows: [], page: 1, pages: 0 });
  stubEmptyTable('共 0 条记录');
  expect(parseRepayPage('',type,'0012345678').rows).toEqual([]);
});
it('存在记录计数或 checkbox 时不能误判为空', () => {
  stubEmptyTable('共 1 条记录');
  expect(() => parseRepayPage('','T0','0012345678')).toThrow('分页信息');
  stubEmptyTable('', true);
  expect(() => parseRepayPage('','T1','0012345678')).toThrow('分页信息');
});
it('T0/T1 正常空结果不会转成查询错误', async () => {
  vi.mocked(queryRepayPage).mockResolvedValue({ rows: [], page: 1, pages: 0 });
  const result = await searchRepay('0012345678');
  expect(result.rows).toEqual([]); expect(result.errors).toEqual([]);
});
const row = (type: 'T0' | 'T1', billId = '000123'): RepayRow => ({ type, billId, merchantId: '0012345678', date: '2026-09-29', reason: '失败', selectable: true });
it('T1 范围从当年一月一日到明天，正确跨年', () => {
  expect(repayDateRange(new Date(2026, 8, 29))).toBe('2026-01-01 ~ 2026-09-30');
  expect(repayDateRange(new Date(2026, 11, 31))).toBe('2026-01-01 ~ 2027-01-01');
});
it('T0 不带时间，T1 带范围，商户号保留前导零', () => {
  const body = repayQueryBody('T0', '0012345678', 1, 'range');
  expect(body.has('dateRange')).toBe(false); expect(body.has('updateDateRange')).toBe(false);
  expect(body.get('FMerchantId')).toBe('0012345678');
  expect(repayQueryBody('T1', '0012345678', 2, 'range').get('dateRange')).toBe('range');
});
it('解析双重 JSON、明确失败和异常响应', () => {
  expect(parseRepayResponse(JSON.stringify(JSON.stringify({ code: '0000', msg: '成功' }))).accepted).toBe(true);
  expect(parseRepayResponse('{"code":"1111","msg":"不允许"}')).toEqual({ accepted: false, message: '不允许' });
  expect(() => parseRepayResponse('<html>登录</html>')).toThrow('待确认');
  expect(() => parseRepayResponse('{}')).toThrow('待确认');
});
it('两种结算方式并行查询，读取后续页', async () => {
  vi.mocked(queryRepayPage).mockImplementation(async (type, _merchant, page) => ({ rows: [row(type, String(page))], page, pages: type === 'T0' ? 2 : 1 }));
  const result = await searchRepay('0012345678', 'range');
  expect(result.rows.map(row => row.type)).toEqual(['T0','T0','T1']); expect(result.errors).toEqual([]);
});
it('一类查询失败保留另一类，不当作无记录', async () => {
  vi.mocked(queryRepayPage).mockImplementation(async type => { if (type === 'T0') throw new Error('登录失效'); return { rows: [row(type)], page: 1, pages: 1 }; });
  const result = await searchRepay('0012345678'); expect(result.rows).toHaveLength(1); expect(result.errors[0]).toContain('T0 查询失败');
});
it('所选记录按 T0/T1 路由提交，单组失败不阻断另一组', async () => {
  vi.mocked(applyRepay).mockRejectedValueOnce(new Error('超时')).mockResolvedValueOnce({ accepted: true, message: '成功' });
  const results = await submitSelectedRepay([row('T0'),row('T1','000456')], '0012345678');
  expect(applyRepay).toHaveBeenNthCalledWith(1,'T0',['000123']); expect(applyRepay).toHaveBeenNthCalledWith(2,'T1',['000456']);
  expect(results.map(result => result.state)).toEqual(['unknown','accepted']); expect(applyRepay).toHaveBeenCalledTimes(2);
});
it('不提交重复、跨商户、不可选和空记录', async () => {
  for (const rows of [[],[row('T0'),row('T0')],[{...row('T0'),merchantId:'9999999999'}],[{...row('T0'),selectable:false}]]) await expect(submitSelectedRepay(rows,'0012345678')).rejects.toThrow();
  expect(applyRepay).not.toHaveBeenCalled();
});
