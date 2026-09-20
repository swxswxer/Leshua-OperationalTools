import { beforeEach, expect, it, vi } from 'vitest';
import { latestReportFailure, queryLatestReportFailure } from '../src/api/report';
import { requestJson } from '../src/api/http';

vi.mock('../src/api/http', async original => ({
  ...await original<typeof import('../src/api/http')>(), requestJson: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
const row = { fId: 22407139, fMerchantId: '5269812733', fStatus: 3, fCreateTime: '2026-09-20 11:33:17.0', fZfbMsg: '商户经营类目与申请产品不符:sub_code(MERCHANT_MCC_LIMIT)' };

it('提取示例支付宝失败原因并保留时间', () => {
  expect(latestReportFailure([row], row.fMerchantId, 'alipay')).toEqual({ reason: row.fZfbMsg, time: row.fCreateTime });
});
it('不能用旧失败覆盖最新成功记录，也不能匹配其他商户', () => {
  expect(latestReportFailure([row, { ...row, fId: 22407140, fStatus: 1 }], row.fMerchantId, 'alipay')).toBeNull();
  expect(latestReportFailure([row], '0000000000', 'alipay')).toBeNull();
});
it('微信读取 fWxMsg，忽略空白原因', () => {
  expect(latestReportFailure([{ ...row, fWxMsg: '资质审核失败' }], row.fMerchantId, 'wechat')?.reason).toBe('资质审核失败');
  expect(latestReportFailure([row], row.fMerchantId, 'wechat')).toBeNull();
});
it('分页取全后选最新，不依赖接口默认排序', async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({ total: 2, rows: [row] })
    .mockResolvedValueOnce({ total: 2, rows: [{ ...row, fId: 22407140, fZfbMsg: '新失败原因' }] });
  expect((await queryLatestReportFailure(row.fMerchantId, 'alipay'))?.reason).toBe('新失败原因');
  const [url, options] = vi.mocked(requestJson).mock.calls[1];
  expect(url).toContain('zfbsubmch.do?method=list');
  const body = options?.body as URLSearchParams;
  expect(body.get('page')).toBe('2');
  expect(body.get('fMerchantId')).toBe(row.fMerchantId);
  expect(body.get('fStatus')).toBe('');
});
it('错误响应不能当作无记录', async () => {
  vi.mocked(requestJson).mockResolvedValue({ success: false });
  await expect(queryLatestReportFailure(row.fMerchantId, 'wechat')).rejects.toThrow('rows');
});
